/* Notifications push (via OneSignal - service gratuit).
 *
 * MISE EN PLACE (une seule fois) :
 * 1. Créez un compte gratuit sur https://onesignal.com puis une app "Web Push".
 * 2. Renseignez l'URL de votre site (celle où vous faites l'upload FTP).
 * 3. Copiez votre "OneSignal App ID" et collez-le ci-dessous à la place de PLACEHOLDER.
 * 4. Ré-uploadez ce fichier (js/push.js) en FTP. C'est tout : le bouton 🔔 du site
 *    permettra à chaque membre de la famille de s'abonner depuis son téléphone.
 * 5. Pour envoyer une notification : dashboard OneSignal > Messages > New Push.
 *
 * Sur iPhone/iPad : Safari exige que le site soit ajouté à l'écran d'accueil
 * (bouton Partager > "Sur l'écran d'accueil") avant que les notifications marchent (iOS 16.4+).
 */

const ONESIGNAL_APP_ID = 'PLACEHOLDER_ONESIGNAL_APP_ID';

function pushConfigured() {
  return ONESIGNAL_APP_ID && !ONESIGNAL_APP_ID.startsWith('PLACEHOLDER');
}

function loadOneSignalSdk() {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.defer = true;
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

async function initPush() {
  const btn = document.getElementById('subscribeBtn');
  if (!btn) return;

  if (!pushConfigured()) {
    btn.title = "Notifications non configurées (voir js/push.js)";
    btn.addEventListener('click', () => {
      alert(
        "Les notifications ne sont pas encore configurées.\n\n" +
        "Ouvrez js/push.js, créez un compte gratuit sur onesignal.com, " +
        "remplacez PLACEHOLDER_ONESIGNAL_APP_ID par votre App ID, puis ré-uploadez le fichier en FTP."
      );
    });
    return;
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  await loadOneSignalSdk();

  OneSignalDeferred.push(async (OneSignal) => {
    await OneSignal.init({ appId: ONESIGNAL_APP_ID, allowLocalhostAsSecureOrigin: true });

    const refreshBtnState = () => {
      const optedIn = OneSignal.User.PushSubscription.optedIn;
      btn.classList.toggle('subscribed', !!optedIn);
      btn.title = optedIn ? 'Notifications activées' : 'Activer les notifications';
    };
    refreshBtnState();
    OneSignal.User.PushSubscription.addEventListener('change', refreshBtnState);

    btn.addEventListener('click', async () => {
      if (OneSignal.User.PushSubscription.optedIn) {
        await OneSignal.User.PushSubscription.optOut();
      } else {
        await OneSignal.Notifications.requestPermission();
        await OneSignal.User.PushSubscription.optIn();
      }
    });
  });
}
