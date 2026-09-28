/* Notifications push (via OneSignal - service gratuit).
 *
 * MISE EN PLACE (une seule fois) :
 * 1. Créez un compte gratuit sur https://onesignal.com puis une app "Web Push".
 * 2. Renseignez l'URL de votre site (celle où vous faites l'upload FTP).
 * 3. Copiez votre "OneSignal App ID" et collez-le ci-dessous à la place de PLACEHOLDER.
 * 4. Ré-uploadez ce fichier (js/push.js) en FTP. C'est tout : les boutons 🔔 Sören /
 *    🔔 Loïse du site permettent à chacun de s'abonner aux alertes qui le concernent.
 * 5. Pour envoyer une notification manuelle : dashboard OneSignal > Messages > New Push.
 *
 * Sur iPhone/iPad : Safari exige que le site soit ajouté à l'écran d'accueil
 * (bouton Partager > "Sur l'écran d'accueil") avant que les notifications marchent (iOS 16.4+).
 */

const ONESIGNAL_APP_ID = '41619346-065e-4c78-9b6b-cf8c3e5bc639';

const PUSH_CHILDREN = [
  { key: 'soren', btnId: 'bellSoren', tag: 'alert_soren' },
  { key: 'loise', btnId: 'bellLoise', tag: 'alert_loise' },
];

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
  const children = PUSH_CHILDREN
    .map((c) => ({ ...c, btn: document.getElementById(c.btnId) }))
    .filter((c) => c.btn);
  if (!children.length) return;

  if (!pushConfigured()) {
    children.forEach((c) => {
      c.btn.title = "Notifications non configurées (voir js/push.js)";
      c.btn.addEventListener('click', () => {
        alert(
          "Les notifications ne sont pas encore configurées.\n\n" +
          "Ouvrez js/push.js, créez un compte gratuit sur onesignal.com, " +
          "remplacez PLACEHOLDER_ONESIGNAL_APP_ID par votre App ID, puis ré-uploadez le fichier en FTP."
        );
      });
    });
    return;
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  await loadOneSignalSdk();

  OneSignalDeferred.push(async (OneSignal) => {
    await OneSignal.init({ appId: ONESIGNAL_APP_ID, allowLocalhostAsSecureOrigin: true });

    // Chaque cloche ne fait que activer/désactiver le tag de l'enfant concerné : on ne
    // désabonne jamais complètement l'appareil (optOut), pour ne pas couper les alertes
    // de l'autre enfant si les deux cloches ont été activées séparément.
    const refreshBtnState = async () => {
      const optedIn = OneSignal.User.PushSubscription.optedIn;
      const tags = optedIn ? await OneSignal.User.getTags() : {};
      children.forEach((c) => {
        const on = !!optedIn && tags[c.tag] === 'true';
        c.btn.classList.toggle('subscribed', on);
        c.btn.title = on
          ? `Alertes de ${c.btn.textContent.replace('🔔', '').trim()} activées`
          : `Recevoir les alertes de ${c.btn.textContent.replace('🔔', '').trim()}`;
      });
    };
    refreshBtnState();
    OneSignal.User.PushSubscription.addEventListener('change', refreshBtnState);

    children.forEach((c) => {
      c.btn.addEventListener('click', async () => {
        const isOn = c.btn.classList.contains('subscribed');
        if (isOn) {
          await OneSignal.User.addTag(c.tag, 'false');
        } else {
          if (!OneSignal.User.PushSubscription.optedIn) {
            await OneSignal.Notifications.requestPermission();
            if (Notification.permission === 'denied') {
              alert(
                "Les notifications sont bloquées pour ce site dans les réglages de votre " +
                "navigateur. Impossible de les activer depuis cette page : ouvrez les " +
                "réglages du site (icône 🔒/ⓘ à côté de l'adresse) et autorisez les " +
                "notifications, puis réessayez."
              );
              return;
            }
            await OneSignal.User.PushSubscription.optIn();
          }
          await OneSignal.User.addTag(c.tag, 'true');
        }
        refreshBtnState();
      });
    });
  });
}
