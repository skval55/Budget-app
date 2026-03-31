import { useEffect, useMemo, useState } from "react";
import { Link } from "@remix-run/react";
import {
  NotificationsService,
} from "../libs/notifications.services";

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : "Unexpected error";

const toTimeInputValue = (timeValue) => String(timeValue || "").slice(0, 5);

const getDeviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (_error) {
    return "UTC";
  }
};

const getDefaultDeviceLabel = () => {
  if (typeof navigator === "undefined") return "This phone";
  const userAgent = navigator.userAgent || "";
  if (/iphone/i.test(userAgent)) return "iPhone";
  if (/ipad/i.test(userAgent)) return "iPad";
  if (/android/i.test(userAgent)) return "Android phone";
  if (/mac/i.test(userAgent)) return "Mac browser";
  if (/windows/i.test(userAgent)) return "Windows browser";
  return "This phone";
};

const getTimezoneOptions = () => {
  const localTimezone = getDeviceTimezone();
  const knownTimezones = [];
  if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
    try {
      knownTimezones.push(...Intl.supportedValuesOf("timeZone"));
    } catch (_error) {
      // Fallback list below.
    }
  }

  const seed = [
    localTimezone,
    "UTC",
    "America/Denver",
    "America/Los_Angeles",
    "America/Chicago",
    "America/New_York",
  ];

  return Array.from(new Set([...seed, ...knownTimezones]));
};

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
};

const getPushPermission = () => {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
};

const formatDateTime = (dateValue) => {
  if (!dateValue) return "Never";
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString();
};

const dayOptions = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export default function Notifications() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [settingsId, setSettingsId] = useState(null);
  const [settingsForm, setSettingsForm] = useState({
    nightly_enabled: true,
    nightly_time: "20:00",
    weekly_enabled: true,
    weekly_day_of_week: "0",
    weekly_time: "18:00",
    timezone: getDeviceTimezone(),
  });
  const [deviceLabel, setDeviceLabel] = useState(getDefaultDeviceLabel());
  const [subscriptions, setSubscriptions] = useState([]);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isEnablingDevice, setIsEnablingDevice] = useState(false);
  const [isRemovingSubscriptionId, setIsRemovingSubscriptionId] = useState(null);
  const [isTestingSubscriptionId, setIsTestingSubscriptionId] = useState(null);
  const [currentEndpoint, setCurrentEndpoint] = useState(null);
  const [pushPermission, setPushPermission] = useState(getPushPermission());
  const [isPushSupported, setIsPushSupported] = useState(false);

  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);
  const hasVapidKey = Boolean((import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY || "").trim());

  const showStatusMessage = (message, type = "success") => {
    setStatusMessage({ message, type });
  };

  const getServiceWorkerRegistration = async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are not supported in this browser.");
    }
    await navigator.serviceWorker.register("/sw.js");
    return navigator.serviceWorker.ready;
  };

  const refreshCurrentDeviceEndpoint = async () => {
    const supportsPush =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window;

    if (!supportsPush) {
      setCurrentEndpoint(null);
      return;
    }

    try {
      const registration = await getServiceWorkerRegistration();
      const browserSubscription = await registration.pushManager.getSubscription();
      setCurrentEndpoint(browserSubscription?.endpoint || null);
    } catch (_error) {
      setCurrentEndpoint(null);
    }
  };

  const loadNotificationsData = async ({ withRefreshIndicator = false } = {}) => {
    if (withRefreshIndicator) setRefreshing(true);
    try {
      const preferredTimezone = getDeviceTimezone();
      const [settings, activeSubscriptions] = await Promise.all([
        NotificationsService.getOrCreateSettings(preferredTimezone),
        NotificationsService.getPushSubscriptions(),
      ]);

      setSettingsId(settings.id);
      setSettingsForm({
        nightly_enabled: Boolean(settings.nightly_enabled),
        nightly_time: toTimeInputValue(settings.nightly_time || "20:00"),
        weekly_enabled: Boolean(settings.weekly_enabled),
        weekly_day_of_week: String(settings.weekly_day_of_week ?? 0),
        weekly_time: toTimeInputValue(settings.weekly_time || "18:00"),
        timezone: settings.timezone || preferredTimezone,
      });
      setSubscriptions(activeSubscriptions);
      await refreshCurrentDeviceEndpoint();
    } catch (error) {
      console.error("Failed to load notification data:", error);
      showStatusMessage(`Failed to load notifications: ${getErrorMessage(error)}`, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const pushSupported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window;
    setIsPushSupported(pushSupported);
    setPushPermission(getPushPermission());
    loadNotificationsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveSettings = async (event) => {
    event.preventDefault();
    if (!settingsId || isSavingSettings) return;
    if (!settingsForm.timezone.trim()) {
      showStatusMessage("Timezone is required.", "error");
      return;
    }

    setIsSavingSettings(true);
    try {
      const updatedSettings = await NotificationsService.updateSettings(settingsId, {
        nightly_enabled: Boolean(settingsForm.nightly_enabled),
        nightly_time: settingsForm.nightly_time,
        weekly_enabled: Boolean(settingsForm.weekly_enabled),
        weekly_day_of_week: Number(settingsForm.weekly_day_of_week),
        weekly_time: settingsForm.weekly_time,
        timezone: settingsForm.timezone.trim(),
      });

      setSettingsForm((currentForm) => ({
        ...currentForm,
        nightly_time: toTimeInputValue(updatedSettings.nightly_time),
        weekly_time: toTimeInputValue(updatedSettings.weekly_time),
        timezone: updatedSettings.timezone,
        weekly_day_of_week: String(updatedSettings.weekly_day_of_week),
      }));

      showStatusMessage("Notification schedule saved.");
    } catch (error) {
      console.error("Failed to save notification settings:", error);
      showStatusMessage(`Failed to save settings: ${getErrorMessage(error)}`, "error");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleEnableOnThisPhone = async () => {
    if (!isPushSupported) {
      showStatusMessage("Push notifications are not supported on this browser.", "error");
      return;
    }

    if (!hasVapidKey) {
      showStatusMessage(
        "Missing VAPID public key. Set VITE_PUSH_VAPID_PUBLIC_KEY in your app env.",
        "error"
      );
      return;
    }

    if (!deviceLabel.trim()) {
      showStatusMessage("Please enter a short device label.", "error");
      return;
    }

    setIsEnablingDevice(true);
    try {
      let currentPermission = getPushPermission();
      if (currentPermission === "default") {
        currentPermission = await Notification.requestPermission();
      }
      setPushPermission(currentPermission);

      if (currentPermission !== "granted") {
        throw new Error("Notification permission was not granted.");
      }

      const registration = await getServiceWorkerRegistration();
      let browserSubscription = await registration.pushManager.getSubscription();

      if (!browserSubscription) {
        browserSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            String(import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY)
          ),
        });
      }

      const subscriptionJson = browserSubscription.toJSON();
      const p256dh = subscriptionJson.keys?.p256dh;
      const auth = subscriptionJson.keys?.auth;

      if (!subscriptionJson.endpoint || !p256dh || !auth) {
        throw new Error("Could not read push subscription keys from this device.");
      }

      await NotificationsService.subscribeDevice({
        device_label: deviceLabel.trim(),
        endpoint: subscriptionJson.endpoint,
        p256dh,
        auth,
      });

      setCurrentEndpoint(subscriptionJson.endpoint);
      await loadNotificationsData({ withRefreshIndicator: true });
      showStatusMessage("Push notifications enabled on this phone.");
    } catch (error) {
      console.error("Failed to enable notifications:", error);
      showStatusMessage(`Failed to enable notifications: ${getErrorMessage(error)}`, "error");
    } finally {
      setIsEnablingDevice(false);
    }
  };

  const handleRemoveDevice = async (subscription) => {
    if (isRemovingSubscriptionId || isTestingSubscriptionId) return;
    if (!window.confirm(`Remove ${subscription.device_label} from reminders?`)) return;

    setIsRemovingSubscriptionId(subscription.id);
    try {
      await NotificationsService.unsubscribeDevice(subscription.id);

      if (subscription.endpoint && subscription.endpoint === currentEndpoint && isPushSupported) {
        const registration = await getServiceWorkerRegistration();
        const browserSubscription = await registration.pushManager.getSubscription();
        if (
          browserSubscription &&
          browserSubscription.endpoint === subscription.endpoint
        ) {
          await browserSubscription.unsubscribe();
        }
        setCurrentEndpoint(null);
      }

      await loadNotificationsData({ withRefreshIndicator: true });
      showStatusMessage("Device removed from reminders.");
    } catch (error) {
      console.error("Failed to remove device:", error);
      showStatusMessage(`Failed to remove device: ${getErrorMessage(error)}`, "error");
    } finally {
      setIsRemovingSubscriptionId(null);
    }
  };

  const handleSendTest = async (subscriptionId) => {
    if (isTestingSubscriptionId || isRemovingSubscriptionId) return;

    setIsTestingSubscriptionId(subscriptionId);
    try {
      await NotificationsService.sendTestNotification(subscriptionId);
      showStatusMessage("Test notification sent.");
    } catch (error) {
      console.error("Failed to send test notification:", error);
      showStatusMessage(`Failed to send test: ${getErrorMessage(error)}`, "error");
    } finally {
      setIsTestingSubscriptionId(null);
    }
  };

  const handleRefresh = async () => {
    await loadNotificationsData({ withRefreshIndicator: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-3 sm:space-y-4">
        <header className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 leading-tight">
                Notifications
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Household nightly and weekly reminder settings
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="w-9 h-9 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 flex items-center justify-center"
                aria-label={refreshing ? "Refreshing notifications" : "Refresh notifications"}
                title={refreshing ? "Refreshing notifications" : "Refresh notifications"}
              >
                {refreshing ? (
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582M20 20v-5h-.581M5.5 9A7 7 0 0119 12.5M18.5 15A7 7 0 015 11.5"
                    />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582M20 20v-5h-.581M5.5 9A7 7 0 0119 12.5M18.5 15A7 7 0 015 11.5"
                    />
                  </svg>
                )}
              </button>
              <Link
                to="/"
                className="w-9 h-9 rounded-md border border-blue-300 bg-blue-50 text-blue-700 flex items-center justify-center"
                aria-label="Back to home"
                title="Back to home"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </header>

        {statusMessage && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              statusMessage.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {statusMessage.message}
          </div>
        )}

        <section className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Reminder Schedule</h2>
          </div>

          {loading ? (
            <p className="text-sm text-gray-600">Loading settings...</p>
          ) : (
            <form onSubmit={handleSaveSettings} className="space-y-3">
              <div className="rounded-md border border-gray-200 p-3">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-800">Nightly reminder</span>
                  <input
                    type="checkbox"
                    checked={settingsForm.nightly_enabled}
                    onChange={(event) =>
                      setSettingsForm((currentForm) => ({
                        ...currentForm,
                        nightly_enabled: event.target.checked,
                      }))
                    }
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
                <div className="mt-2">
                  <label className="text-xs text-gray-600 block mb-1">Nightly time</label>
                  <input
                    type="time"
                    value={settingsForm.nightly_time}
                    onChange={(event) =>
                      setSettingsForm((currentForm) => ({
                        ...currentForm,
                        nightly_time: event.target.value,
                      }))
                    }
                    disabled={!settingsForm.nightly_enabled}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
                  />
                </div>
              </div>

              <div className="rounded-md border border-gray-200 p-3">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-800">Weekly reminder</span>
                  <input
                    type="checkbox"
                    checked={settingsForm.weekly_enabled}
                    onChange={(event) =>
                      setSettingsForm((currentForm) => ({
                        ...currentForm,
                        weekly_enabled: event.target.checked,
                      }))
                    }
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Weekly day</label>
                    <select
                      value={settingsForm.weekly_day_of_week}
                      onChange={(event) =>
                        setSettingsForm((currentForm) => ({
                          ...currentForm,
                          weekly_day_of_week: event.target.value,
                        }))
                      }
                      disabled={!settingsForm.weekly_enabled}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
                    >
                      {dayOptions.map((dayOption) => (
                        <option key={dayOption.value} value={String(dayOption.value)}>
                          {dayOption.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Weekly time</label>
                    <input
                      type="time"
                      value={settingsForm.weekly_time}
                      onChange={(event) =>
                        setSettingsForm((currentForm) => ({
                          ...currentForm,
                          weekly_time: event.target.value,
                        }))
                      }
                      disabled={!settingsForm.weekly_enabled}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-800 block mb-1">Timezone</label>
                <input
                  type="text"
                  list="timezone-options"
                  value={settingsForm.timezone}
                  onChange={(event) =>
                    setSettingsForm((currentForm) => ({
                      ...currentForm,
                      timezone: event.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <datalist id="timezone-options">
                  {timezoneOptions.map((timezoneValue) => (
                    <option key={timezoneValue} value={timezoneValue} />
                  ))}
                </datalist>
              </div>

              <button
                type="submit"
                disabled={isSavingSettings}
                className="w-full sm:w-auto px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium disabled:bg-blue-300"
              >
                {isSavingSettings ? "Saving..." : "Save schedule"}
              </button>
            </form>
          )}
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">This Phone</h2>
          <p className="text-sm text-gray-600 mb-3">
            Enable push reminders on this device. Repeat on your wife&apos;s phone.
          </p>

          <div className="space-y-2">
            <label className="text-sm text-gray-700 block">
              Device label
              <input
                type="text"
                maxLength={80}
                value={deviceLabel}
                onChange={(event) => setDeviceLabel(event.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="My iPhone"
              />
            </label>

            <div className="text-xs text-gray-600">
              Permission:{" "}
              <span className="font-medium text-gray-800">
                {pushPermission === "unsupported" ? "Not supported" : pushPermission}
              </span>
            </div>
            {!hasVapidKey && (
              <p className="text-xs text-amber-700">
                Missing `VITE_PUSH_VAPID_PUBLIC_KEY` in app env.
              </p>
            )}
            <button
              type="button"
              onClick={handleEnableOnThisPhone}
              disabled={isEnablingDevice || !isPushSupported || !hasVapidKey}
              className="w-full sm:w-auto px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium disabled:bg-green-300"
            >
              {isEnablingDevice ? "Enabling..." : "Enable notifications on this phone"}
            </button>
          </div>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Registered Devices</h2>
            <span className="text-sm text-gray-500">{subscriptions.length} active</span>
          </div>

          {subscriptions.length === 0 ? (
            <p className="text-sm text-gray-600">No phones registered yet.</p>
          ) : (
            <div className="space-y-2">
              {subscriptions.map((subscription) => {
                const isCurrentDevice =
                  Boolean(currentEndpoint) && subscription.endpoint === currentEndpoint;

                return (
                  <div
                    key={subscription.id}
                    className="rounded-md border border-gray-200 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {subscription.device_label}
                          {isCurrentDevice ? " (this phone)" : ""}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          Last seen {formatDateTime(subscription.last_seen_at)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleSendTest(subscription.id)}
                        disabled={
                          isTestingSubscriptionId === subscription.id ||
                          Boolean(isRemovingSubscriptionId)
                        }
                        className="px-2.5 py-1.5 text-xs rounded-md border border-blue-300 text-blue-700 bg-white disabled:opacity-50"
                      >
                        {isTestingSubscriptionId === subscription.id ? "Sending..." : "Test"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDevice(subscription)}
                        disabled={
                          isRemovingSubscriptionId === subscription.id ||
                          Boolean(isTestingSubscriptionId)
                        }
                        className="px-2.5 py-1.5 text-xs rounded-md border border-red-300 text-red-700 bg-white disabled:opacity-50"
                      >
                        {isRemovingSubscriptionId === subscription.id ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
