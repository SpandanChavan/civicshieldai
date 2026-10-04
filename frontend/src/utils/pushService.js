import { supabase } from '@/services/supabaseClient';
import { backendApi } from '@/services/backendApi';

export async function registerAndSubscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push messaging is not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return;
    }

    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.warn('VITE_VAPID_PUBLIC_KEY is not set. Cannot subscribe to push.');
      return;
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

    // Reuse an existing subscription if the browser already has one — calling
    // subscribe() again with the same key returns the same object, but reading
    // it first avoids a redundant round-trip on every app load.
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      }));

    // Send the subscription through backendApi, NOT bare fetch(). The axios
    // instance carries the request interceptor that attaches the Supabase JWT,
    // so the backend's stateScope middleware can resolve req.userId and store
    // the row against this user. Bare fetch() sent no Authorization header, so
    // every subscription landed with user_id = NULL and push could only ever
    // broadcast to everyone — never to a state or an individual.
    await backendApi.post('/alerts/subscribe', {
      endpoint: subscription.endpoint,
      keys: subscription.toJSON().keys,
      device_info: { user_agent: navigator.userAgent },
    });

    console.log('Push subscription successful');
  } catch (error) {
    console.error('Error during push subscription:', error);
  }
}

/**
 * Re-register the push subscription against the *current* user.
 *
 * A subscription row is keyed by endpoint (unique), and the endpoint does not
 * change when a different person signs in on the same device. Without this,
 * the row would keep pointing at whoever subscribed first. Call on sign-in so
 * the upsert re-binds the endpoint to the new user_id.
 */
export async function resubscribePushForCurrentUser() {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return;
    await registerAndSubscribeToPush();
  } catch (error) {
    console.warn('[Push] Re-subscribe skipped:', error.message);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
