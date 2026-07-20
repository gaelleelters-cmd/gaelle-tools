/* Injected at deploy from GitHub secret MAILMASS_CLIENT_ID when set.
 * SPA client IDs are public (not secrets) — required so visitors can Sign in with Microsoft.
 */
window.MAIL_MASS_CONFIG = {
  clientId: 'MAILMASS_CLIENT_ID_PLACEHOLDER',
  authority: 'https://login.microsoftonline.com/common'
};
