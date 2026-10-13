// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Injectable } from '@angular/core';
import { makeSingleton } from '@singletons';
import { CoreSites } from '@services/sites';
import { CoreCourses, CoreEnrolledCourseData } from '@features/courses/services/courses';
import { CoreGrades, CoreGradesGradeOverview } from '@features/grades/services/grades';
import { AddonBadges, AddonBadgesUserBadge } from '@addons/badges/services/badges';
import { AddonCalendar, AddonCalendarEvent } from '@addons/calendar/services/calendar';
import { AddonCourseCompletion, AddonCourseCompletionCourseCompletionStatus } from '@addons/coursecompletion/services/coursecompletion';
import { CorePromiseUtils } from '@singletons/promise-utils';

/**
 * Interface for student metrics data.
 */
export interface StudentMetrics {
    // Course stats
    totalCourses: number;
    coursesCompleted: number;
    coursesInProgress: number;
    coursesFuture: number;
    averageProgress: number;

    // Activity stats
    totalActivitiesCompleted: number;
    totalActivities: number;
    activitiesCompletionPercentage: number;

    // Badges
    totalBadges: number;
    recentBadges: AddonBadgesUserBadge[];

    // Grades
    averageGrade: number;
    hasGrades: boolean;
    coursesWithGrades: number;

    // Upcoming events/deadlines
    upcomingEvents: StudentMetricEvent[];
    totalUpcomingEvents: number;

    // Activity streak (days)
    activityStreak: number;
    lastAccessDate: Date | null;

    // Level calculation (gamification)
    level: number;
    currentXP: number;
    xpForNextLevel: number;
    xpProgress: number;
}

/**
 * Interface for upcoming events.
 */
export interface StudentMetricEvent {
    id: number;
    name: string;
    timestart: number;
    courseName?: string;
    eventType: string;
    daysUntil: number;
    isUrgent: boolean;
}

/**
 * Interface for course with completion data.
 */
export interface CourseWithCompletion extends CoreEnrolledCourseData {
    completionStatus?: AddonCourseCompletionCourseCompletionStatus;
}

/**
 * Service to aggregate student metrics from various Moodle webservices.
 * Used for gamified student profile visualization.
 */
@Injectable({ providedIn: 'root' })
export class StudentMetricsProvider {

    /**
     * XP points configuration for level calculation.
     */
    protected readonly XP_CONFIG = {
        courseCompleted: 100,
        activityCompleted: 10,
        badgeEarned: 50,
        perfectGrade: 25,
        streakBonus: 5, // per day
        baseXpPerLevel: 200,
        levelMultiplier: 1.5,
    };

    /**
     * Get all student metrics aggregated from various services.
     *
     * @param userId User ID. If not defined, current user.
     * @param siteId Site ID. If not defined, current site.
     * @returns Promise resolved with student metrics.
     */
    async getStudentMetrics(userId?: number, siteId?: string): Promise<StudentMetrics> {
        const site = await CoreSites.getSite(siteId);
        userId = userId || site.getUserId();

        // Fetch all data in parallel for better performance
        const [
            courses,
            badges,
            grades,
            upcomingEvents,
        ] = await Promise.all([
            this.getCoursesWithProgress(siteId),
            this.getUserBadges(userId, siteId),
            this.getCoursesGrades(siteId),
            this.getUpcomingEvents(siteId),
        ]);

        // Calculate course stats
        const courseStats = this.calculateCourseStats(courses);

        // Calculate activity completion across all courses
        const activityStats = await this.calculateActivityStats(courses, userId, siteId);

        // Calculate grade average
        const gradeStats = this.calculateGradeStats(grades);

        // Calculate activity streak
        const streakStats = this.calculateActivityStreak(courses);

        // Calculate XP and level
        const xpStats = this.calculateXPAndLevel(
            courseStats.coursesCompleted,
            activityStats.totalActivitiesCompleted,
            badges.length,
            gradeStats.averageGrade,
            streakStats.activityStreak,
        );

        // Process upcoming events
        const processedEvents = this.processUpcomingEvents(upcomingEvents, courses);

        return {
            // Course stats
            totalCourses: courseStats.totalCourses,
            coursesCompleted: courseStats.coursesCompleted,
            coursesInProgress: courseStats.coursesInProgress,
            coursesFuture: courseStats.coursesFuture,
            averageProgress: courseStats.averageProgress,

            // Activity stats
            totalActivitiesCompleted: activityStats.totalActivitiesCompleted,
            totalActivities: activityStats.totalActivities,
            activitiesCompletionPercentage: activityStats.activitiesCompletionPercentage,

            // Badges
            totalBadges: badges.length,
            recentBadges: badges.slice(0, 6), // Last 6 badges

            // Grades
            averageGrade: gradeStats.averageGrade,
            hasGrades: gradeStats.hasGrades,
            coursesWithGrades: gradeStats.coursesWithGrades,

            // Upcoming events
            upcomingEvents: processedEvents.slice(0, 5), // Next 5 events
            totalUpcomingEvents: processedEvents.length,

            // Activity streak
            activityStreak: streakStats.activityStreak,
            lastAccessDate: streakStats.lastAccessDate,

            // Gamification
            level: xpStats.level,
            currentXP: xpStats.currentXP,
            xpForNextLevel: xpStats.xpForNextLevel,
            xpProgress: xpStats.xpProgress,
        };
    }

    /**
     * Get user courses with progress information.
     *
     * @param siteId Site ID.
     * @returns Promise resolved with courses.
     */
    protected async getCoursesWithProgress(siteId?: string): Promise<CoreEnrolledCourseData[]> {
        try {
            return await CoreCourses.getUserCourses(false, siteId);
        } catch {
            return [];
        }
    }

    /**
     * Get user badges.
     *
     * @param userId User ID.
     * @param siteId Site ID.
     * @returns Promise resolved with badges.
     */
    protected async getUserBadges(userId: number, siteId?: string): Promise<AddonBadgesUserBadge[]> {
        try {
            // courseId = 0 gets all badges
            const badges = await AddonBadges.getUserBadges(0, userId, siteId);
            // Sort by date issued (most recent first)
            return badges.sort((a, b) => b.dateissued - a.dateissued);
        } catch {
            return [];
        }
    }

    /**
     * Get courses grades overview.
     *
     * @param siteId Site ID.
     * @returns Promise resolved with grades.
     */
    protected async getCoursesGrades(siteId?: string): Promise<CoreGradesGradeOverview[]> {
        try {
            return await CoreGrades.getCoursesGrades(siteId);
        } catch {
            return [];
        }
    }

    /**
     * Get upcoming calendar events.
     *
     * @param siteId Site ID.
     * @returns Promise resolved with events.
     */
    protected async getUpcomingEvents(siteId?: string): Promise<AddonCalendarEvent[]> {
        try {
            const response = await AddonCalendar.getUpcomingEvents(undefined, undefined, false, siteId);
            return response.events || [];
        } catch {
            return [];
        }
    }

    /**
     * Calculate course statistics.
     *
     * @param courses User courses.
     * @returns Course statistics.
     */
    protected calculateCourseStats(courses: CoreEnrolledCourseData[]): {
        totalCourses: number;
        coursesCompleted: number;
        coursesInProgress: number;
        coursesFuture: number;
        averageProgress: number;
    } {
        const now = Date.now() / 1000;
        let totalProgress = 0;
        let coursesWithProgress = 0;
        let coursesCompleted = 0;
        let coursesInProgress = 0;
        let coursesFuture = 0;

        courses.forEach(course => {
            // Check if course has progress tracking
            if (course.progress !== undefined && course.progress !== null) {
                totalProgress += course.progress;
                coursesWithProgress++;

                if (course.progress >= 100 || course.completed) {
                    coursesCompleted++;
                } else if (course.startdate && course.startdate > now) {
                    coursesFuture++;
                } else {
                    coursesInProgress++;
                }
            } else {
                // No progress tracking, check dates
                if (course.enddate && course.enddate < now) {
                    coursesCompleted++;
                } else if (course.startdate && course.startdate > now) {
                    coursesFuture++;
                } else {
                    coursesInProgress++;
                }
            }
        });

        return {
            totalCourses: courses.length,
            coursesCompleted,
            coursesInProgress,
            coursesFuture,
            averageProgress: coursesWithProgress > 0 ? Math.round(totalProgress / coursesWithProgress) : 0,
        };
    }

    /**
     * Calculate activity completion statistics.
     *
     * @param courses User courses.
     * @param userId User ID.
     * @param siteId Site ID.
     * @returns Activity statistics.
     */
    protected async calculateActivityStats(
        courses: CoreEnrolledCourseData[],
        userId: number,
        siteId?: string,
    ): Promise<{
        totalActivitiesCompleted: number;
        totalActivities: number;
        activitiesCompletionPercentage: number;
    }> {
        let totalActivitiesCompleted = 0;
        let totalActivities = 0;

        // Get completion status for each course that has completion enabled
        const completionPromises = courses
            .filter(course => course.enablecompletion && course.completionhascriteria)
            .map(async course => {
                try {
                    const completion = await AddonCourseCompletion.getCompletion(course.id, userId, {}, siteId);
                    if (completion && completion.completions) {
                        completion.completions.forEach(criteria => {
                            totalActivities++;
                            if (criteria.complete) {
                                totalActivitiesCompleted++;
                            }
                        });
                    }
                } catch {
                    // Ignore errors for individual courses
                }
            });

        await CorePromiseUtils.allPromises(completionPromises);

        return {
            totalActivitiesCompleted,
            totalActivities,
            activitiesCompletionPercentage: totalActivities > 0
                ? Math.round((totalActivitiesCompleted / totalActivities) * 100)
                : 0,
        };
    }

    /**
     * Calculate grade statistics.
     *
     * @param grades Courses grades.
     * @returns Grade statistics.
     */
    protected calculateGradeStats(grades: CoreGradesGradeOverview[]): {
        averageGrade: number;
        hasGrades: boolean;
        coursesWithGrades: number;
    } {
        const validGrades = grades.filter(g => g.grade !== undefined && g.grade !== null && g.grade !== '-');
        let totalGrade = 0;
        let coursesWithGrades = 0;

        validGrades.forEach(grade => {
            const numericGrade = parseFloat(String(grade.grade));
            if (!isNaN(numericGrade)) {
                totalGrade += numericGrade;
                coursesWithGrades++;
            }
        });

        return {
            averageGrade: coursesWithGrades > 0 ? Math.round((totalGrade / coursesWithGrades) * 10) / 10 : 0,
            hasGrades: coursesWithGrades > 0,
            coursesWithGrades,
        };
    }

    /**
     * Calculate activity streak based on course access.
     *
     * @param courses User courses.
     * @returns Streak statistics.
     */
    protected calculateActivityStreak(courses: CoreEnrolledCourseData[]): {
        activityStreak: number;
        lastAccessDate: Date | null;
    } {
        // Get the most recent access across all courses
        let mostRecentAccess = 0;

        courses.forEach(course => {
            if (course.lastaccess && course.lastaccess > mostRecentAccess) {
                mostRecentAccess = course.lastaccess;
            }
        });

        if (mostRecentAccess === 0) {
            return { activityStreak: 0, lastAccessDate: null };
        }

        const lastAccessDate = new Date(mostRecentAccess * 1000);
        const now = new Date();
        const diffTime = now.getTime() - lastAccessDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        // If last access was more than 1 day ago, streak is broken
        // Otherwise, count consecutive days (simplified - in production you'd track daily access)
        let activityStreak = 0;
        if (diffDays <= 1) {
            // User accessed today or yesterday, calculate streak
            // For now, use a simplified calculation based on course progress
            activityStreak = Math.min(diffDays === 0 ? 1 : 1, 30); // Simplified

            // In a real implementation, you'd track daily logins
            // For demo purposes, estimate streak based on activity
            const activeCourses = courses.filter(c => c.lastaccess && c.progress && c.progress > 0);
            activityStreak = Math.min(activeCourses.length, 30);
        }

        return { activityStreak, lastAccessDate };
    }

    /**
     * Process upcoming events for display.
     *
     * @param events Calendar events.
     * @param courses User courses (for course names).
     * @returns Processed events.
     */
    protected processUpcomingEvents(
        events: AddonCalendarEvent[],
        courses: CoreEnrolledCourseData[],
    ): StudentMetricEvent[] {
        const now = Date.now() / 1000;
        const coursesMap = new Map(courses.map(c => [c.id, c.fullname]));

        return events
            .filter(event => event.timestart > now)
            .map(event => {
                const daysUntil = Math.ceil((event.timestart - now) / (60 * 60 * 24));

                return {
                    id: event.id,
                    name: event.name,
                    timestart: event.timestart,
                    courseName: event.course?.id ? coursesMap.get(event.course.id) : undefined,
                    eventType: event.eventtype || 'event',
                    daysUntil,
                    isUrgent: daysUntil <= 2,
                };
            })
            .sort((a, b) => a.timestart - b.timestart);
    }

    /**
     * Calculate XP and level based on achievements.
     *
     * @param coursesCompleted Number of completed courses.
     * @param activitiesCompleted Number of completed activities.
     * @param badgesEarned Number of badges earned.
     * @param averageGrade Average grade.
     * @param streak Activity streak days.
     * @returns XP and level data.
     */
    protected calculateXPAndLevel(
        coursesCompleted: number,
        activitiesCompleted: number,
        badgesEarned: number,
        averageGrade: number,
        streak: number,
    ): {
        level: number;
        currentXP: number;
        xpForNextLevel: number;
        xpProgress: number;
    } {
        // Calculate total XP
        let totalXP = 0;
        totalXP += coursesCompleted * this.XP_CONFIG.courseCompleted;
        totalXP += activitiesCompleted * this.XP_CONFIG.activityCompleted;
        totalXP += badgesEarned * this.XP_CONFIG.badgeEarned;
        totalXP += streak * this.XP_CONFIG.streakBonus;

        // Bonus for high grades
        if (averageGrade >= 90) {
            totalXP += this.XP_CONFIG.perfectGrade * coursesCompleted;
        }

        // Calculate level (exponential curve)
        let level = 1;
        let xpForCurrentLevel = 0;
        let xpForNextLevel = this.XP_CONFIG.baseXpPerLevel;

        while (totalXP >= xpForNextLevel) {
            level++;
            xpForCurrentLevel = xpForNextLevel;
            xpForNextLevel = Math.floor(
                this.XP_CONFIG.baseXpPerLevel * Math.pow(this.XP_CONFIG.levelMultiplier, level - 1),
            );
        }

        const xpInCurrentLevel = totalXP - xpForCurrentLevel;
        const xpNeededForLevel = xpForNextLevel - xpForCurrentLevel;
        const xpProgress = Math.round((xpInCurrentLevel / xpNeededForLevel) * 100);

        return {
            level,
            currentXP: totalXP,
            xpForNextLevel,
            xpProgress,
        };
    }

    /**
     * Invalidate all cached metrics data.
     *
     * @param siteId Site ID.
     */
    async invalidateMetrics(siteId?: string): Promise<void> {
        await Promise.all([
            CoreCourses.invalidateUserCourses(siteId),
            CoreGrades.invalidateCoursesGradesData(siteId),
            AddonCalendar.invalidateAllUpcomingEvents(siteId),
        ]);
    }

}

export const StudentMetrics = makeSingleton(StudentMetricsProvider);
