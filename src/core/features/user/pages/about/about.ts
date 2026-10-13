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

import { Component, OnDestroy, OnInit } from '@angular/core';

import { CoreSites } from '@services/sites';
import { CorePromiseUtils } from '@singletons/promise-utils';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import {
    CoreUser,
    CoreUserProfile,
} from '@features/user/services/user';
import { CoreNavigator } from '@services/navigator';
import { CoreIonLoadingElement } from '@classes/ion-loading';
import { CoreSite } from '@classes/sites/site';
import { CoreFileUploaderHelper } from '@features/fileuploader/services/fileuploader-helper';
import { CoreMimetype } from '@singletons/mimetype';
import { Translate } from '@singletons';
import { CoreUrl } from '@singletons/url';
import { CoreLoadings } from '@services/overlays/loadings';
import { CoreTime } from '@singletons/time';
import { CoreAlerts } from '@services/overlays/alerts';
import { CoreSharedModule } from '@/core/shared.module';
import { CoreUserProfileFieldComponent } from '../../components/user-profile-field/user-profile-field';
import {
    CORE_USER_PROFILE_REFRESHED,
    CORE_USER_PROFILE_PICTURE_UPDATED,
    CORE_USER_PROFILE_SERVER_TIMEZONE,
} from '@features/user/constants';
import { CoreModals } from '@services/overlays/modals';
import { CoreFile } from '@services/file';
import { CoreFileUtils } from '@singletons/file-utils';
import { StudentMetrics, StudentMetrics as StudentMetricsService } from '@features/user/services/student-metrics';
import { CoreUserSupport } from '@features/user/services/support';
import { CoreOpener } from '@singletons/opener';

/**
 * Page that displays user profile with gamified metrics.
 */
@Component({
    selector: 'page-core-user-about',
    templateUrl: 'about.html',
    styleUrls: ['about.scss'],
    imports: [
        CoreSharedModule,
        CoreUserProfileFieldComponent,
    ],
})
export default class CoreUserAboutPage implements OnInit, OnDestroy {

    courseId!: number;
    userLoaded = false;
    metricsLoaded = false;
    hasContact = false;
    hasDetails = false;
    user?: CoreUserProfile;
    title?: string;
    canChangeProfilePicture = false;
    interests?: string[];
    displayTimezone = false;
    canShowDepartment = false;
    metrics?: StudentMetrics;
    isCurrentUser = false;
    estimatedHours = 0;
    userRanking = 1;

    protected userId!: number;
    protected site!: CoreSite;
    protected obsProfileRefreshed?: CoreEventObserver;

    constructor() {
        try {
            this.site = CoreSites.getRequiredCurrentSite();
        } catch (error) {
            CoreAlerts.showError(error);
            CoreNavigator.back();

            return;
        }

        this.obsProfileRefreshed = CoreEvents.on(CORE_USER_PROFILE_REFRESHED, (data) => {
            if (!this.user || !data.user) {
                return;
            }

            this.user.email = data.user.email;
        }, CoreSites.getCurrentSiteId());
    }

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        this.userId = CoreNavigator.getRouteNumberParam('userId') || this.site.getUserId();
        this.courseId = CoreNavigator.getRouteNumberParam('courseId') || 0;
        this.canShowDepartment = this.userId != this.site.getUserId();
        this.isCurrentUser = this.userId === this.site.getUserId();

        // Allow to change the profile image only in the app profile page.
        this.canChangeProfilePicture =
            !this.courseId &&
            this.isCurrentUser &&
            this.site.canUploadFiles() &&
            !CoreUser.isUpdatePictureDisabledInSite(this.site);

        // Load user data
        await this.fetchUser();
        this.userLoaded = true;

        // Load metrics in parallel (only for current user's own profile)
        if (this.isCurrentUser) {
            this.loadMetrics();
        } else {
            this.metricsLoaded = true;
        }
    }

    /**
     * Load student metrics data.
     */
    protected async loadMetrics(): Promise<void> {
        try {
            this.metrics = await StudentMetricsService.getStudentMetrics(this.userId);
            this.computeDerivedMetrics();
        } catch (error) {
            console.warn('Failed to load student metrics:', error);
        } finally {
            this.metricsLoaded = true;
        }
    }

    /**
     * Compute derived metrics (estimated hours, ranking) from base metrics.
     */
    protected computeDerivedMetrics(): void {
        if (!this.metrics) {
            return;
        }

        // Estimate study hours: ~15h per completed course + ~5h per in-progress course
        this.estimatedHours = this.metrics.coursesCompleted * 15 + this.metrics.coursesInProgress * 5;

        // Compute ranking position based on level (higher level = better rank)
        this.userRanking = Math.max(1, 11 - this.metrics.level);
    }

    /**
     * Fetches the user data.
     */
    async fetchUser(): Promise<void> {
        try {
            const user = await CoreUser.getProfile(this.userId, this.courseId);

            this.interests = user.interests ?
                user.interests.split(',').map(interest => interest.trim()) :
                undefined;

            this.hasContact = !!(user.email || user.phone1 || user.phone2 || user.city || user.country || user.address);
            this.hasDetails = !!(user.interests || (user.customfields && user.customfields.length > 0));

            this.user = user;
            this.title = user.fullname;

            this.fillTimezone();

            await this.checkUserImageUpdated();
        } catch (error) {
            CoreAlerts.showError(error, { default: Translate.instant('core.user.errorloaduser') });
        }
    }

    /**
     * Check if current user image has changed.
     */
    protected async checkUserImageUpdated(): Promise<void> {
        if (!this.site || !this.site.getInfo() || !this.user) {
            return;
        }

        if (this.userId != this.site.getUserId() || !this.isUserAvatarDirty()) {
            return;
        }

        try {
            await CoreSites.updateSiteInfo(this.site.getId());
        } catch {
            CoreEvents.trigger(CORE_USER_PROFILE_PICTURE_UPDATED, {
                userId: this.userId,
                picture: this.user.profileimageurl,
            }, this.site.getId());
        }

        if (this.isUserAvatarDirty()) {
            await this.refreshUser();
        } else {
            CoreEvents.trigger(CORE_USER_PROFILE_PICTURE_UPDATED, {
                userId: this.userId,
                picture: this.user.profileimageurl,
            }, this.site.getId());
        }
    }

    /**
     * Opens dialog to change profile picture.
     */
    async changeProfilePicture(): Promise<void> {
        const maxSize = -1;
        const title = Translate.instant('core.user.newpicture');
        const mimetypes = CoreMimetype.getGroupMimeInfo('image', 'mimetypes');
        let modal: CoreIonLoadingElement | undefined;

        try {
            let fileEntry = await CoreFileUploaderHelper.selectFile(maxSize, false, title, mimetypes);
            const fileObject = await CoreFile.getFileObjectFromFileEntry(fileEntry);
            const image = await CoreFileUtils.filetoBlob(fileObject);

            const { CoreViewerImageEditComponent } = await import('@features/viewer/components/image-edit/image-edit');

            const editedImageBlob = await CoreModals.openModal<Blob>({
                component: CoreViewerImageEditComponent,
                cssClass: 'core-modal-fullscreen',
                componentProps: {
                    image,
                },
            });

            if (editedImageBlob) {
                fileEntry = await CoreFile.writeFile(fileEntry.fullPath, editedImageBlob);
            } else {
                return;
            }

            const result =
                await CoreFileUploaderHelper.uploadFileEntry(fileEntry, true, maxSize, true, false);

            modal = await CoreLoadings.show('core.sending', true);

            const profileImageURL = await CoreUser.changeProfilePicture(result.itemid, this.userId, this.site.getId());

            CoreEvents.trigger(CORE_USER_PROFILE_PICTURE_UPDATED, {
                userId: this.userId,
                picture: profileImageURL,
            }, this.site.getId());

            CoreSites.updateSiteInfo(this.site.getId());

            this.refreshUser();
        } catch (error) {
            CoreAlerts.showError(error);
        } finally {
            modal?.dismiss();
        }
    }

    /**
     * Refresh the user data.
     */
    async refreshUser(event?: HTMLIonRefresherElement): Promise<void> {
        await CorePromiseUtils.ignoreErrors(CoreUser.invalidateUserCache(this.userId));

        await Promise.all([
            this.fetchUser(),
            this.isCurrentUser ? this.refreshMetrics() : Promise.resolve(),
        ]);

        event?.complete();

        if (this.user) {
            CoreEvents.trigger(CORE_USER_PROFILE_REFRESHED, {
                courseId: this.courseId,
                userId: this.userId,
                user: this.user,
            }, this.site.getId());
        }
    }

    /**
     * Refresh student metrics.
     */
    protected async refreshMetrics(): Promise<void> {
        try {
            await StudentMetricsService.invalidateMetrics();
            this.metrics = await StudentMetricsService.getStudentMetrics(this.userId);
            this.computeDerivedMetrics();
        } catch (error) {
            console.warn('Failed to refresh student metrics:', error);
        }
    }

    /**
     * Navigate to grades page.
     */
    openGrades(): void {
        CoreNavigator.navigateToSitePath('/grades');
    }

    /**
     * Navigate to private files page.
     */
    openFiles(): void {
        CoreNavigator.navigateToSitePath('/privatefiles');
    }

    /**
     * Navigate to reports page.
     */
    openReports(): void {
        CoreNavigator.navigateToSitePath('/reportbuilder');
    }

    /**
     * Navigate to preferences page.
     */
    openPreferences(): void {
        CoreNavigator.navigateToSitePath('preferences');
    }

    /**
     * Contact site support.
     */
    async contactSupport(): Promise<void> {
        await CoreOpener.openInBrowser('https://tmo.cedia.edu.ec/contacto/');
    }

    /**
     * Show account switcher modal.
     */
    async switchAccounts(): Promise<void> {
        const { CoreLoginSitesModalComponent } = await import('@features/login/components/sites-modal/sites-modal');

        await CoreModals.openSideModal({
            component: CoreLoginSitesModalComponent,
            cssClass: 'core-modal-lateral core-modal-lateral-sm',
        });
    }

    /**
     * Logout the user.
     */
    async logout(): Promise<void> {
        await CoreSites.logout({
            forceLogout: true,
        });
    }

    /**
     * Check whether the user avatar is not up to date with site info.
     */
    protected isUserAvatarDirty(): boolean {
        if (!this.user || !this.site) {
            return false;
        }

        const courseAvatarUrl = this.normalizeAvatarUrl(this.user.profileimageurl);
        const siteAvatarUrl = this.normalizeAvatarUrl(this.site.getInfo()?.userpictureurl);

        return courseAvatarUrl !== siteAvatarUrl;
    }

    /**
     * Normalize an avatar url regardless of theme.
     */
    protected normalizeAvatarUrl(avatarUrl?: string): string {
        if (!avatarUrl) {
            return 'undefined';
        }

        if (CoreUrl.isThemeImageUrl(avatarUrl, this.site?.siteUrl)) {
            return 'default';
        }

        return avatarUrl;
    }

    /**
     * Fill user timezone depending on the server and fix the legacy timezones.
     */
    protected fillTimezone(): void {
        if (!this.user) {
            return;
        }

        const serverTimezone = CoreSites.getRequiredCurrentSite().getStoredConfig('timezone');
        this.displayTimezone = !!serverTimezone;

        if (!this.displayTimezone) {
            return;
        }

        if (this.user.timezone === CORE_USER_PROFILE_SERVER_TIMEZONE) {
            this.user.timezone = serverTimezone;
        }

        if (this.user.timezone) {
            this.user.timezone = CoreTime.translateLegacyTimezone(this.user.timezone);
        }
    }

    /**
     * Open a user interest.
     */
    openInterest(interest: string): void {
        CoreNavigator.navigateToSitePath('/tag/index', { params: {
            tagName: interest,
        } });
    }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.obsProfileRefreshed?.off();
    }

}
