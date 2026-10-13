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

import {Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, OnDestroy, inject, signal} from '@angular/core';

import { CoreSites, CoreSitesReadingStrategy } from '@services/sites';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import { CoreSharedModule } from '@/core/shared.module';
import { CoreSiteLogoComponent } from '../../../../components/site-logo/site-logo';
import { CoreMainMenuUserButtonComponent } from '../../components/user-menu-button/user-menu-button';
import { CoreCourses, CoreCoursesMyCoursesUpdatedEventData, CoreCourseSummaryExporterData } from '@features/courses/services/courses';
import { CoreCoursesHelper, CoreEnrolledCourseDataWithExtraInfoAndOptions } from '@features/courses/services/courses-helper';
import { CoreCourseHelper, CorePrefetchStatusInfo } from '@features/course/services/course-helper';
import { CoreCourseOptionsDelegate } from '@features/course/services/course-options-delegate';
import { CoreSite } from '@classes/sites/site';
import { CorePromiseUtils } from '@singletons/promise-utils';
import { CoreText } from '@singletons/text';
import { AddonCourseCompletion } from '@addons/coursecompletion/services/coursecompletion';
import { CoreNavigator } from '@services/navigator';
import { DownloadStatus } from '@/core/constants';
import { CoreCoursesCourseListItemComponent } from '@features/courses/components/course-list-item/course-list-item';
import {
    CORE_COURSES_MY_COURSES_UPDATED_EVENT,
    CoreCoursesMyCoursesUpdatedEventAction,
    CORE_COURSES_STATE_FAVOURITE,
    CORE_COURSES_STATE_HIDDEN,
} from '@features/courses/constants';
import { CoreAlerts } from '@services/overlays/alerts';
import { CoreTime } from '@singletons/time';
import { PageLoadsManager } from '@classes/page-loads-manager';
import { PageLoadWatcher } from '@classes/page-load-watcher';
import { AsyncDirective } from '@classes/async-directive';
import {
    AddonBlockRecentlyAccessedItemsComponent
} from "@addons/block/recentlyaccesseditems/components/recentlyaccesseditems/recentlyaccesseditems";
import {CoreCourseBlock} from "@features/course/services/course";

type AddonBlockMyOverviewTimeFilters = 'allincludinghidden' | 'all' | 'inprogress' | 'future' | 'past' | 'favourite' | 'hidden';

const FILTER_PRIORITY: AddonBlockMyOverviewTimeFilters[] =
    ['all', 'inprogress', 'future', 'past', 'favourite', 'allincludinghidden', 'hidden'];

/**
 * Page that displays the Home with direct course view.
 */
@Component({
    selector: 'page-core-mainmenu-home',
    templateUrl: 'home.html',
    styleUrl: 'home.scss',
    imports: [
        CoreSharedModule,
        CoreSiteLogoComponent,
        CoreMainMenuUserButtonComponent,
        CoreCoursesCourseListItemComponent,
        AddonBlockRecentlyAccessedItemsComponent,
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export default class CoreMainMenuHomePage implements OnInit, OnDestroy, AsyncDirective {

    filteredCourses: CoreEnrolledCourseDataWithExtraInfoAndOptions[] = [];

    recentBlock = signal<Partial<CoreCourseBlock>>({
        name: 'recentlyaccesseditems',
        visible: true,
        region: 'content',
        instanceid: 0,
    });

    prefetchCoursesData: CorePrefetchStatusInfo = {
        icon: '',
        statusTranslatable: 'core.loading',
        status: DownloadStatus.DOWNLOADABLE_NOT_DOWNLOADED,
        loading: true,
    };

    downloadCourseEnabled = false;
    downloadCoursesEnabled = false;
    searchEnabled = false;

    filters = {
        enabled: false,
        show: {
            allincludinghidden: true,
            all: true,
            past: true,
            inprogress: true,
            future: true,
            favourite: true,
            hidden: true,
            custom: false,
        } as Record<string, boolean>,
        timeFilterSelected: 'allincludinghidden' as string,
        customFilters: [] as { name: string; value: string }[],
    };

    sort = {
        shortnameEnabled: false,
        selected: 'fullname',
        enabled: false,
    };

    textFilter = '';
    hasCourses = false;
    loaded = false;
    siteName = '';
    siteUserName = '';
    filterCounts: Record<string, number> = {};

    userId?: number;

    protected currentSite!: CoreSite;
    protected allCourses: CoreEnrolledCourseDataWithExtraInfoAndOptions[] = [];
    protected prefetchIconsInitialized = false;
    protected isDirty = false;
    protected isDestroyed = false;
    protected coursesObserver?: CoreEventObserver;
    protected updateSiteObserver?: CoreEventObserver;
    protected gradePeriodAfter = 0;
    protected gradePeriodBefore = 0;
    protected firstLoadWatcher?: PageLoadWatcher;
    protected loadsManager: PageLoadsManager;

    constructor() {
        const loadsManager = inject(PageLoadsManager, { optional: true });
        this.loadsManager = loadsManager ?? new PageLoadsManager();
    }

    /**
     * @inheritdoc
     */
    async ready(): Promise<void> {
        // Page is ready immediately.
    }

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        this.currentSite = CoreSites.getRequiredCurrentSite();
        this.firstLoadWatcher = this.loadsManager.startComponentLoad(this);

        this.loadUserName();
        await this.loadSiteName();

        // Refresh the enabled flags if enabled.
        this.downloadCourseEnabled = !CoreCourses.isDownloadCourseDisabledInSite();
        this.downloadCoursesEnabled = !CoreCourses.isDownloadCoursesDisabledInSite();
        this.searchEnabled = !CoreCourses.isSearchCoursesDisabledInSite();

        this.updateSiteObserver = CoreEvents.on(CoreEvents.SITE_UPDATED, async () => {
            this.downloadCourseEnabled = !CoreCourses.isDownloadCourseDisabledInSite();
            this.downloadCoursesEnabled = !CoreCourses.isDownloadCoursesDisabledInSite();
            this.searchEnabled = !CoreCourses.isSearchCoursesDisabledInSite();
            await this.loadSiteName();
        }, CoreSites.getCurrentSiteId());

        this.coursesObserver = CoreEvents.on(
            CORE_COURSES_MY_COURSES_UPDATED_EVENT,
            (data) => {
                this.refreshCourseList(data);
            },
            CoreSites.getCurrentSiteId(),
        );

        // Load saved preferences.
        const [savedSort, savedFilter] = await Promise.all([
            this.currentSite.getLocalSiteConfig('AddonBlockMyOverviewSort', this.sort.selected),
            this.currentSite.getLocalSiteConfig('AddonBlockMyOverviewFilter', this.filters.timeFilterSelected),
        ]);

        this.sort.selected = savedSort;
        this.filters.timeFilterSelected = savedFilter;

        CoreSites.loginNavigationFinished();

        await this.loadContent();
    }

    /**
     * Load user full name.
     */
    protected loadUserName(): void {
        this.siteUserName = CoreSites.getRequiredCurrentSite().infos?.fullname || '';
    }

    /**
     * Load the site name.
     */
    protected async loadSiteName(): Promise<void> {
        const site = CoreSites.getRequiredCurrentSite();
        this.siteName = await site.getSiteName() || '';
    }

    /**
     * Load all content.
     */
    protected async loadContent(): Promise<void> {
        try {
            const loadWatcher = this.firstLoadWatcher ?? this.loadsManager.startComponentLoad(this);
            this.firstLoadWatcher = undefined;

            await Promise.all([
                this.loadAllCourses(loadWatcher),
                this.loadGracePeriod(loadWatcher),
            ]);

            this.loadSort();
            await this.loadFilters(loadWatcher);
        } catch (error) {
            CoreAlerts.showError(error, { default: 'Error getting my overview data.' });
        }

        this.isDirty = false;
        this.loaded = true;
    }

    /**
     * Load all courses.
     */
    protected async loadAllCourses(loadWatcher: PageLoadWatcher): Promise<void> {
        this.allCourses = await loadWatcher.watchRequest(
            CoreCoursesHelper.getUserCoursesWithOptionsObservable({
                sort: this.sort.selected,
                readingStrategy: this.isDirty ? CoreSitesReadingStrategy.PREFER_NETWORK : loadWatcher.getReadingStrategy(),
            }),
            (prevCourses, newCourses) => this.coursesHaveMeaningfulChanges(prevCourses, newCourses),
        );

        this.hasCourses = this.allCourses.length > 0;
    }

    /**
     * Load grace period config.
     */
    protected async loadGracePeriod(loadWatcher: PageLoadWatcher): Promise<void> {
        this.hasCourses = this.allCourses.length > 0;

        try {
            const siteConfig = await loadWatcher.watchRequest(
                this.currentSite.getConfigObservable(
                    undefined,
                    this.isDirty ? CoreSitesReadingStrategy.PREFER_NETWORK : loadWatcher.getReadingStrategy(),
                ),
            );

            this.gradePeriodAfter = parseInt(siteConfig.coursegraceperiodafter, 10);
            this.gradePeriodBefore = parseInt(siteConfig.coursegraceperiodbefore, 10);
        } catch {
            this.gradePeriodAfter = 0;
            this.gradePeriodBefore = 0;
        }
    }

    /**
     * Load sort options.
     */
    protected loadSort(): void {
        const sampleCourse = this.allCourses[0];

        this.sort.shortnameEnabled = !!sampleCourse?.displayname && !!sampleCourse?.shortname &&
            sampleCourse?.fullname != sampleCourse?.displayname;

        if (!this.sort.shortnameEnabled && this.sort.selected === 'shortname') {
            this.saveSort('fullname');
        }

        this.sort.enabled = sampleCourse?.lastaccess !== undefined;
    }

    /**
     * Load filters based on course data.
     */
    protected async loadFilters(loadWatcher?: PageLoadWatcher): Promise<void> {
        if (!this.hasCourses) {
            return;
        }

        this.textFilter = '';

        const sampleCourse = this.allCourses[0];

        this.filters.show.hidden = sampleCourse.hidden !== undefined;
        this.filters.show.allincludinghidden = true;
        this.filters.show.all = true;
        this.filters.show.inprogress = true;
        this.filters.show.past = true;
        this.filters.show.future = true;
        this.filters.show.favourite = sampleCourse.isfavourite !== undefined;

        this.filters.enabled = Object.keys(this.filters.show).some((key) => this.filters.show[key]);

        if (!this.filters.enabled) {
            this.filters.show.all = true;
            this.saveFilters('all');
        }

        await this.filterCourses(loadWatcher);
    }

    /**
     * Compute the count of courses for each filter category.
     */
    protected computeFilterCounts(): void {
        this.filterCounts = {
            allincludinghidden: this.allCourses.length,
            all: this.allCourses.filter((c) => !c.hidden).length,
            inprogress: this.allCourses.filter((c) =>
                !c.hidden &&
                !CoreCoursesHelper.isPastCourse(c, this.gradePeriodAfter) &&
                !CoreCoursesHelper.isFutureCourse(c, this.gradePeriodAfter, this.gradePeriodBefore)).length,
            future: this.allCourses.filter((c) =>
                !c.hidden &&
                CoreCoursesHelper.isFutureCourse(c, this.gradePeriodAfter, this.gradePeriodBefore)).length,
            past: this.allCourses.filter((c) =>
                !c.hidden &&
                CoreCoursesHelper.isPastCourse(c, this.gradePeriodAfter)).length,
            favourite: this.allCourses.filter((c) => !c.hidden && c.isfavourite).length,
            hidden: this.allCourses.filter((c) => c.hidden).length,
        };
    }

    /**
     * Refresh course list on events.
     */
    protected async refreshCourseList(data: CoreCoursesMyCoursesUpdatedEventData): Promise<void> {
        if (data.action === CoreCoursesMyCoursesUpdatedEventAction.ENROL) {
            return this.refreshContent();
        }

        const course = this.allCourses.find((c) => c.id == data.courseId);

        if (data.action === CoreCoursesMyCoursesUpdatedEventAction.STATE_CHANGED) {
            if (!course) {
                return this.refreshContent();
            }

            if (data.state === CORE_COURSES_STATE_FAVOURITE) {
                course.isfavourite = !!data.value;
            }
            if (data.state === CORE_COURSES_STATE_HIDDEN) {
                course.hidden = !!data.value;
            }

            await CoreCourses.invalidateUserCourses();
            await this.filterCourses();
        }

        if (data.action === CoreCoursesMyCoursesUpdatedEventAction.VIEW && data.courseId != CoreSites.getCurrentSiteHomeId()) {
            if (!course) {
                return this.refreshContent();
            }
            course.lastaccess = CoreTime.timestamp();
            await CoreCourses.invalidateUserCourses();
            await this.filterCourses();
        }
    }

    /**
     * Refresh content (invalidate and reload).
     */
    async refreshContent(): Promise<void> {
        this.isDirty = true;
        this.loaded = false;

        try {
            const courseIds = this.allCourses.map((c) => c.id);
            await this.invalidateCourses(courseIds);
        } catch {
            // Ignore errors.
        }

        await this.loadContent();
    }

    /**
     * Invalidate courses data.
     */
    protected async invalidateCourses(courseIds: number[]): Promise<void> {
        const promises: Promise<void>[] = [];

        promises.push(CoreCourses.invalidateUserCourses().finally(() =>
            CorePromiseUtils.allPromises(courseIds.map((id) =>
                AddonCourseCompletion.invalidateCourseCompletion(id)))));

        if (courseIds.length === 1) {
            promises.push(CoreCourseOptionsDelegate.clearAndInvalidateCoursesOptions(courseIds[0]));
        } else {
            promises.push(CoreCourseOptionsDelegate.clearAndInvalidateCoursesOptions());
        }

        if (courseIds.length > 0) {
            promises.push(CoreCourses.invalidateCoursesByField('ids', courseIds.join(',')));
        }

        await CorePromiseUtils.allPromises(promises).finally(() => {
            this.prefetchIconsInitialized = false;
        });
    }

    /**
     * Do refresh (pull-to-refresh).
     */
    async doRefresh(refresher?: HTMLIonRefresherElement): Promise<void> {
        await this.refreshContent();
        refresher?.complete();
    }

    /**
     * Text filter changed.
     */
    filterTextChanged(target: EventTarget | null): void {
        this.textFilter = (target as any)?.value || '';
        this.filterCourses();
    }

    /**
     * Select a time filter.
     */
    selectFilter(value: string): void {
        this.filters.timeFilterSelected = value;
        this.filterCourses();
    }

    /**
     * Filter courses by time filter and text.
     */
    protected async filterCourses(loadWatcher?: PageLoadWatcher): Promise<void> {
        let timeFilter = this.filters.timeFilterSelected;

        this.computeFilterCounts();
        this.filteredCourses = this.allCourses;

        // Filter is not active, take the first active or all.
        if (!this.filters.show[timeFilter]) {
            timeFilter = FILTER_PRIORITY.find((name) => this.filters.show[name]) || 'all';
        }
        this.saveFilters(timeFilter);

        // Apply filters.
        switch (timeFilter) {
            case 'allincludinghidden':
                // Show all courses including hidden.
                break;
            case 'all':
                this.filteredCourses = this.filteredCourses.filter((c) => !c.hidden);
                break;
            case 'inprogress':
                this.filteredCourses = this.filteredCourses.filter((c) =>
                    !c.hidden &&
                    !CoreCoursesHelper.isPastCourse(c, this.gradePeriodAfter) &&
                    !CoreCoursesHelper.isFutureCourse(c, this.gradePeriodAfter, this.gradePeriodBefore));
                break;
            case 'future':
                this.filteredCourses = this.filteredCourses.filter((c) =>
                    !c.hidden &&
                    CoreCoursesHelper.isFutureCourse(c, this.gradePeriodAfter, this.gradePeriodBefore));
                break;
            case 'past':
                this.filteredCourses = this.filteredCourses.filter((c) =>
                    !c.hidden &&
                    CoreCoursesHelper.isPastCourse(c, this.gradePeriodAfter));
                break;
            case 'favourite':
                this.filteredCourses = this.filteredCourses.filter((c) => !c.hidden && c.isfavourite);
                break;
            case 'hidden':
                this.filteredCourses = this.filteredCourses.filter((c) => c.hidden);
                break;
        }

        // Text filter.
        const value = this.textFilter.trim().toLowerCase();
        if (value !== '' && this.filteredCourses.length > 0) {
            if (this.filteredCourses[0].displayname !== undefined) {
                this.filteredCourses = this.filteredCourses.filter((c) =>
                    c.displayname && c.displayname.toLowerCase().indexOf(value) > -1);
            } else {
                this.filteredCourses = this.filteredCourses.filter((c) =>
                    c.fullname.toLowerCase().indexOf(value) > -1);
            }
        }

        this.sortCourses(this.sort.selected);

        // Refresh prefetch data.
        this.prefetchIconsInitialized = false;
        this.initPrefetchCoursesIcons();
    }

    /**
     * Sort courses.
     */
    sortCourses(sort: string): void {
        if (!this.sort.enabled) {
            return;
        }

        if (this.sort.selected !== sort) {
            this.saveSort(sort);
        }

        if (this.sort.selected === 'lastaccess') {
            this.filteredCourses.sort((a, b) => (b.lastaccess || 0) - (a.lastaccess || 0));
        } else if (this.sort.selected === 'fullname') {
            this.filteredCourses.sort((a, b) => a.fullname.toLowerCase().localeCompare(b.fullname.toLowerCase()));
        } else if (this.sort.selected === 'shortname') {
            this.filteredCourses.sort((a, b) => a.shortname.toLowerCase().localeCompare(b.shortname.toLowerCase()));
        }
    }

    /**
     * Save filter preference.
     */
    async saveFilters(timeFilter: string): Promise<void> {
        this.filters.timeFilterSelected = timeFilter;
        await this.currentSite.setLocalSiteConfig('AddonBlockMyOverviewFilter', timeFilter);
    }

    /**
     * Save sort preference.
     */
    async saveSort(sort: string): Promise<void> {
        this.sort.selected = sort;
        await this.currentSite.setLocalSiteConfig('AddonBlockMyOverviewSort', sort);
    }

    /**
     * Init prefetch icons.
     */
    async initPrefetchCoursesIcons(): Promise<void> {
        if (this.prefetchIconsInitialized) {
            return;
        }
        this.prefetchIconsInitialized = true;
        this.prefetchCoursesData = await CoreCourseHelper.initPrefetchCoursesIcons(this.filteredCourses, this.prefetchCoursesData);
    }

    /**
     * Prefetch all shown courses.
     */
    async prefetchCourses(): Promise<void> {
        const initialIcon = this.prefetchCoursesData.icon;
        try {
            await CoreCourseHelper.prefetchCourses(this.filteredCourses, this.prefetchCoursesData);
        } catch (error) {
            if (!this.isDestroyed) {
                CoreAlerts.showError(error, { default: 'core.course.errordownloadingcourse' });
                this.prefetchCoursesData.icon = initialIcon;
            }
        }
    }

    /**
     * Go to search courses.
     */
    async openSearch(): Promise<void> {
        CoreNavigator.navigateToSitePath('courses/list', { params: { mode: 'search' } });
    }

    /**
     * Compare if the WS data has meaningful changes.
     */
    protected async coursesHaveMeaningfulChanges(
        previousCourses: CoreEnrolledCourseDataWithExtraInfoAndOptions[],
        newCourses: CoreEnrolledCourseDataWithExtraInfoAndOptions[],
    ): Promise<boolean> {
        if (previousCourses.length !== newCourses.length) {
            return true;
        }

        previousCourses = Array.from(previousCourses)
            .sort((a, b) => a.fullname.toLowerCase().localeCompare(b.fullname.toLowerCase()));
        newCourses = Array.from(newCourses)
            .sort((a, b) => a.fullname.toLowerCase().localeCompare(b.fullname.toLowerCase()));

        for (let i = 0; i < previousCourses.length; i++) {
            if (
                previousCourses[i].progress !== newCourses[i].progress ||
                previousCourses[i].categoryname !== newCourses[i].categoryname ||
                (previousCourses[i].displayname ?? previousCourses[i].fullname) !==
                    (newCourses[i].displayname ?? newCourses[i].fullname)
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.isDestroyed = true;
        this.coursesObserver?.off();
        this.updateSiteObserver?.off();
    }

}
