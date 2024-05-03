import React from 'react'
import type { ObservableSet } from 'mobx'
import type { NotificationsManagerRef } from '../Components/Notifications.js'
import type { RecentlyUsedIdsStore } from './RecentlyUsedIdsStore.js'
import type { CompanionSocketType } from '../util.js'
import type { PagesStore } from './PagesStore.js'
import type { EventDefinitionsStore } from './EventDefinitionsStore.js'
import type { ActionDefinitionsStore } from './ActionDefinitionsStore.js'
import type { FeedbackDefinitionsStore } from './FeedbackDefinitionsStore.js'
import type { ModuleInfoStore } from './ModuleInfoStore.js'
import type { TriggersListStore } from './TriggersListStore.js'
import type { SurfacesStore } from './SurfacesStore.js'
import type { UserConfigStore } from './UserConfigStore.js'

export const RootAppStoreContext = React.createContext<RootAppStore>(null as any) // TODO - fix this?

export interface RootAppStore {
	readonly socket: CompanionSocketType
	readonly notifier: React.RefObject<NotificationsManagerRef> // TODO - this is not good

	readonly modules: ModuleInfoStore

	/** Currently running 'learn' callbacks */
	readonly activeLearns: ObservableSet<string>

	readonly recentlyAddedActions: RecentlyUsedIdsStore
	readonly recentlyAddedFeedbacks: RecentlyUsedIdsStore

	readonly actionDefinitions: ActionDefinitionsStore
	readonly eventDefinitions: EventDefinitionsStore
	readonly feedbackDefinitions: FeedbackDefinitionsStore

	readonly pages: PagesStore
	readonly surfaces: SurfacesStore

	readonly triggersList: TriggersListStore

	readonly userConfig: UserConfigStore
}
