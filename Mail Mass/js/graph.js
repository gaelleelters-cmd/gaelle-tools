(function (global) {
  'use strict';

  var SCOPES = ['User.Read', 'Mail.Send'];
  var msalInstance = null;
  var initPromise = null;

  function cfg() {
    var base = global.MAIL_MASS_CONFIG || {};
    var fromStorage = '';
    try { fromStorage = localStorage.getItem('mailmass_client_id') || ''; } catch (e) {}
    return {
      clientId: String(fromStorage || base.clientId || '').trim(),
      authority: base.authority || 'https://login.microsoftonline.com/common'
    };
  }

  function setClientId(id) {
    var value = String(id || '').trim();
    try {
      if (value) localStorage.setItem('mailmass_client_id', value);
      else localStorage.removeItem('mailmass_client_id');
    } catch (e) {}
    initPromise = null;
    msalInstance = null;
  }

  function isConfigured() {
    var id = cfg().clientId;
    return !!(id && id !== 'MAILMASS_CLIENT_ID_PLACEHOLDER');
  }

  function ensureMsal() {
    if (!isConfigured()) {
      return Promise.reject(new Error('Microsoft sign-in is not configured yet (missing client ID).'));
    }
    if (!global.msal || !global.msal.PublicClientApplication) {
      return Promise.reject(new Error('Microsoft sign-in library failed to load. Check your network.'));
    }
    if (initPromise) return initPromise;

    initPromise = Promise.resolve().then(function () {
      msalInstance = new global.msal.PublicClientApplication({
        auth: {
          clientId: String(cfg().clientId).trim(),
          authority: cfg().authority || 'https://login.microsoftonline.com/common',
          redirectUri: window.location.href.split('#')[0].split('?')[0]
        },
        cache: {
          cacheLocation: 'localStorage',
          storeAuthStateInCookie: false
        }
      });
      return msalInstance.initialize().then(function () {
        return msalInstance.handleRedirectPromise();
      }).then(function () {
        return msalInstance;
      });
    });
    return initPromise;
  }

  function getAccount() {
    if (!msalInstance) return null;
    var accounts = msalInstance.getAllAccounts();
    return accounts && accounts.length ? accounts[0] : null;
  }

  function getAccessToken() {
    return ensureMsal().then(function () {
      var account = getAccount();
      var request = { scopes: SCOPES, account: account || undefined };
      if (!account) {
        return msalInstance.loginPopup({ scopes: SCOPES }).then(function (login) {
          request.account = login.account;
          return msalInstance.acquireTokenSilent(request).catch(function () {
            return msalInstance.acquireTokenPopup(request);
          });
        });
      }
      return msalInstance.acquireTokenSilent(request).catch(function () {
        return msalInstance.acquireTokenPopup(request);
      });
    }).then(function (tokenResponse) {
      return tokenResponse.accessToken;
    });
  }

  function signIn() {
    return getAccessToken().then(function () {
      var account = getAccount();
      return {
        name: (account && (account.name || account.username)) || 'Signed in',
        username: (account && account.username) || ''
      };
    });
  }

  function signOut() {
    return ensureMsal().then(function () {
      var account = getAccount();
      if (!account) return;
      return msalInstance.logoutPopup({ account: account });
    });
  }

  function htmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildBodyHtml(greeting, firstName, message, messageIsHtml) {
    var open = greeting
      ? htmlEsc(greeting) + ' ' + htmlEsc(firstName) + ','
      : htmlEsc(firstName) + ',';
    var html = "<div style=\"font-family:Calibri,sans-serif;font-size:11pt;font-weight:normal;\">" +
      '<p style="margin:0 0 8pt 0;">' + open + '</p>';
    if (messageIsHtml || /<(p|div|span|br|b|i|u|strong|em|font|ul|ol|li)\b/i.test(String(message || ''))) {
      html += String(message || '');
    } else {
      var norm = String(message || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      norm.split(/\n\n/).forEach(function (para) {
        var p = para.trim();
        if (!p) return;
        html += '<p style="margin:0 0 8pt 0;">' + htmlEsc(p).replace(/\n/g, '<br>') + '</p>';
      });
    }
    return html + '</div>';
  }

  function recipientList(value) {
    if (!value) return [];
    return String(value).split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean).map(function (address) {
      return { emailAddress: { address: address } };
    });
  }

  function sendOne(token, mail, sharedAttachment) {
    var message = {
      subject: mail.subject || 'Document Attached',
      body: {
        contentType: 'HTML',
        content: buildBodyHtml(mail.greeting, mail.first, mail.message, mail.messageIsHtml)
      },
      toRecipients: recipientList(mail.email)
    };
    var cc = recipientList(mail.cc);
    var bcc = recipientList(mail.bcc);
    if (cc.length) message.ccRecipients = cc;
    if (bcc.length) message.bccRecipients = bcc;

    if (mail.fileAttachment && mail.fileAttachment.contentBytes) {
      message.attachments = [{
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: mail.fileAttachment.name,
        contentType: mail.fileAttachment.contentType || 'application/octet-stream',
        contentBytes: mail.fileAttachment.contentBytes
      }];
    } else if (sharedAttachment && sharedAttachment.contentBytes) {
      message.attachments = [{
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: sharedAttachment.name,
        contentType: sharedAttachment.contentType || 'application/octet-stream',
        contentBytes: sharedAttachment.contentBytes
      }];
    }

    return fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: message, saveToSentItems: true })
    }).then(function (res) {
      if (res.status === 202 || res.ok) return;
      return res.json().catch(function () { return {}; }).then(function (err) {
        var msg = (err && err.error && err.error.message) || ('Send failed (' + res.status + ')');
        throw new Error(msg);
      });
    });
  }

  function sendAll(mails, sharedAttachment, onProgress) {
    var processed = 0;
    var skipped = 0;
    return getAccessToken().then(function (token) {
      var chain = Promise.resolve();
      mails.forEach(function (mail, index) {
        chain = chain.then(function () {
          if (!mail.email) {
            skipped += 1;
            if (onProgress) onProgress(index + 1, mails.length);
            return;
          }
          return sendOne(token, mail, sharedAttachment).then(function () {
            processed += 1;
            if (onProgress) onProgress(index + 1, mails.length);
          });
        });
      });
      return chain.then(function () {
        return { processed: processed, skipped: skipped };
      });
    });
  }

  function currentUser() {
    return ensureMsal().then(function () {
      var account = getAccount();
      if (!account) return null;
      return {
        name: account.name || account.username,
        username: account.username
      };
    }).catch(function () { return null; });
  }

  global.MailMassGraph = {
    isConfigured: isConfigured,
    setClientId: setClientId,
    getClientId: function () { return cfg().clientId; },
    signIn: signIn,
    signOut: signOut,
    currentUser: currentUser,
    sendAll: sendAll,
    getAccessToken: getAccessToken
  };
})(window);
