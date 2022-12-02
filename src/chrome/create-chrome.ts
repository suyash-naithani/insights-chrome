import { createFetchPermissionsWatcher } from '../auth/fetchPermissions';
import { LibJWT, createAuthObject } from '../auth';
import { AppNavigationCB, ChromeAPI, ChromeUser, GenericCB, NavDOMEvent } from '@redhat-cloud-services/types';
import { Store } from 'redux';
import { AnalyticsBrowser } from '@segment/analytics-next';
import get from 'lodash/get';
import Cookies from 'js-cookie';

import {
  AppNavClickItem,
  appAction,
  appNavClick,
  appObjectId,
  globalFilterScope,
  registerModule,
  removeGlobalFilter,
  toggleFeedbackModal,
  toggleGlobalFilter,
} from '../redux/actions';
import { getEnv, getEnvDetails, getUrl, isBeta, isFedRamp, isProd, updateDocumentTitle } from '../utils/common';
import { createSupportCase } from '../utils/createCase';
import debugFunctions from '../utils/debugFunctions';
import { flatTags } from '../components/GlobalFilter/globalFilterApi';
import { PUBLIC_EVENTS, visibilityFunctions } from '../utils/consts';
import { usePendoFeedback } from '../components/Feedback';
import { middlewareListener } from '../redux/redux-config';
import { clearAnsibleTrialFlag, isAnsibleTrialFlagActive, setAnsibleTrialFlag } from '../utils/isAnsibleTrialFlagActive';
import chromeHistory from '../utils/chromeHistory';
import { ReduxState } from '../redux/store';
import { STORE_INITIAL_HASH } from '../redux/action-types';
import { ChromeModule, FlagTagsFilter } from '../@types/types';

export type CreateChromeContextConfig = {
  useGlobalFilter: (callback: (selectedTags?: FlagTagsFilter) => any) => ReturnType<typeof callback>;
  libJwt: LibJWT;
  getUser: () => Promise<void | ChromeUser>;
  store: Store<ReduxState>;
  modulesConfig?: {
    [key: string]: ChromeModule;
  };
  setPageMetadata: (pageOptions: any) => any;
  analytics: AnalyticsBrowser;
  quickstartsAPI: ChromeAPI['quickStarts'];
  helpTopics: ChromeAPI['helpTopics'];
};

export const createChromeContext = ({
  useGlobalFilter,
  analytics,
  libJwt,
  getUser,
  store,
  modulesConfig,
  setPageMetadata,
  quickstartsAPI,
  helpTopics,
}: CreateChromeContextConfig): ChromeAPI => {
  const fetchPermissions = createFetchPermissionsWatcher();
  const dispatch = store.dispatch;
  const actions = {
    appAction: (action: string) => dispatch(appAction(action)),
    appObjectId: (objectId: string) => dispatch(appObjectId(objectId)),
    appNavClick: (item: AppNavClickItem, event?: NavDOMEvent) => dispatch(appNavClick(item, event)),
    globalFilterScope: (scope: string) => dispatch(globalFilterScope(scope)),
    registerModule: (module?: string, manifest?: string) => dispatch(registerModule(module, manifest)),
    removeGlobalFilter: (isHidden: boolean) => store.dispatch(removeGlobalFilter(isHidden)),
  };

  const on = (type: keyof typeof PUBLIC_EVENTS, callback: AppNavigationCB | GenericCB) => {
    if (!Object.prototype.hasOwnProperty.call(PUBLIC_EVENTS, type)) {
      throw new Error(`Unknown event type: ${type}`);
    }

    const [listener, selector] = PUBLIC_EVENTS[type];
    if (type !== 'APP_NAVIGATION' && typeof selector === 'string') {
      (callback as GenericCB)({
        data: get(store.getState(), selector) || {},
      });
    }
    if (typeof listener === 'function') {
      return middlewareListener.addNew(listener(callback as GenericCB));
    }
  };

  const identifyApp = (_data: any, appTitle?: string, noSuffix?: boolean) => {
    updateDocumentTitle(appTitle, noSuffix);
    return Promise.resolve();
  };

  const api: ChromeAPI = {
    ...actions,
    auth: createAuthObject(libJwt, getUser, store, modulesConfig),
    initialized: true,
    // FIXME: Remove typecasting after types package update
    isProd: isProd as unknown as boolean,
    forceDemo: () => Cookies.set('cs_demo', 'true'),
    getBundle: () => getUrl('bundle'),
    getApp: () => getUrl('app'),
    getEnvironment: () => getEnv(),
    getEnvironmentDetails: () => getEnvDetails(),
    createCase: (fields?: any) => getUser().then((user) => createSupportCase(user!.identity, libJwt, fields)),
    getUserPermissions: async (app = '', bypassCache?: boolean) => {
      await getUser();
      return fetchPermissions(libJwt.jwt.getEncodedToken() || '', app, bypassCache);
    },
    identifyApp,
    hideGlobalFilter: (isHidden: boolean) => {
      const initialHash = store.getState()?.chrome?.initialHash;
      /**
       * Restore app URL hash fragment after the global filter is disabled
       */
      if (initialHash) {
        chromeHistory.replace({
          ...chromeHistory.location,
          hash: initialHash,
        });
        store.dispatch({ type: STORE_INITIAL_HASH });
      }
      store.dispatch(toggleGlobalFilter(isHidden));
    },
    isBeta,
    isChrome2: true,
    enable: debugFunctions,
    isDemo: () => (Cookies.get('cs_demo') ? true : false),
    isPenTest: () => (Cookies.get('x-rh-insights-pentest') ? true : false),
    mapGlobalFilter: flatTags,
    navigation: () => console.error("Don't use insights.chrome.navigation, it has been deprecated!"),
    updateDocumentTitle,
    visibilityFunctions,
    on,
    experimentalApi: true,
    isFedramp: isFedRamp(),
    usePendoFeedback,
    segment: {
      setPageMetadata,
    },
    toggleFeedbackModal: (...args) => dispatch(toggleFeedbackModal(...args)),
    // FIXME: Update types once merged
    quickStarts: quickstartsAPI as unknown as ChromeAPI['quickStarts'],
    helpTopics,
    clearAnsibleTrialFlag,
    isAnsibleTrialFlagActive,
    setAnsibleTrialFlag,
    chromeHistory,
    analytics: analytics!,
    // FIXME: Update types once merged
    useGlobalFilter: useGlobalFilter as unknown as ChromeAPI['useGlobalFilter'],
    init: () => {
      console.error(
        `Calling deprecated "chrome.init function"! Please remove the function call from your code. Functions "on" and "updateDocumentTitle" are directly accessible from "useChrome" hook.`
      );
      return {
        on,
        updateDocumentTitle,
        identifyApp,
      };
    },
    $internal: {
      store,
    },
  };
  return api;
};
