/* CCGA Staff Console — mailing list administration. No dependencies, no build.
 *
 * Authentication is the board's: the same magic link, the same session cookie,
 * the same is_admin flag. There is no second password and no second roster,
 * because a second way in is a second thing to get wrong.
 *
 * Every state this page can be in is decided by one call to /me:
 *   401            -> show the sign-in form
 *   200, no admin  -> say so plainly and link to the board portal
 *   200, admin     -> show the console
 */
(function () {
    'use strict';

    var B = window.CCGABoard;
    var el = function (id) { return document.getElementById(id); };
    var notice = el('notice');

    function say(kind, message) { B.setNotice(notice, kind, message); }
    function clearNotice() { B.hide(notice); }

    /* ---------------------------------------------------------------- state */

    function showOnly(id) {
        ['signInPanel', 'notAdminPanel', 'console'].forEach(function (name) {
            var node = el(name);
            if (node) node.hidden = (name !== id);
        });
    }

    function boot() {
        B.api('/me').then(function (res) {
            if (res.status === 401) { showOnly('signInPanel'); return; }
            if (!res.ok || !res.data || !res.data.member) {
                showOnly('signInPanel');
                say('warn', 'Could not reach the API. If this persists the Worker may not be deployed yet.');
                return;
            }

            var member = res.data.member;
            var who = el('whoami');
            who.textContent = member.full_name || member.email;
            B.show(who);

            if (!member.is_admin) { showOnly('notAdminPanel'); return; }

            showOnly('console');
            loadStats();
            loadMailings();
        }).catch(function () {
            showOnly('signInPanel');
            say('warn', 'Could not reach the API.');
        });
    }

    /* --------------------------------------------------------------- sign in */

    el('sendLink').addEventListener('click', function () {
        var address = (el('email').value || '').trim();
        if (!address) { say('warn', 'Enter the email address on your board record.'); return; }

        this.disabled = true;
        B.api('/auth/request', { method: 'POST', body: { email: address } }).then(function () {
            /* Deliberately identical whether or not the address is on the roster. */
            say('ok', 'If that address is on the board roster, a sign-in link is on its way. It is good for 24 hours and can be used once.');
        }).catch(function () {
            say('warn', 'Could not reach the API.');
        }).then(function () {
            el('sendLink').disabled = false;
        });
    });

    var signOut = el('signOut');
    if (signOut) {
        signOut.addEventListener('click', function (event) {
            event.preventDefault();
            B.api('/auth/logout', { method: 'POST' }).then(function () { window.location.reload(); });
        });
    }

    /* ----------------------------------------------------------------- stats */

    function loadStats() {
        B.api('/admin/list/stats').then(function (res) {
            if (!res.ok) return;
            var s = res.data.subscribers || {};
            el('statActive').textContent = s.active || 0;
            el('statPending').textContent = s.pending || 0;
            el('statUnsub').textContent = s.unsubscribed || 0;
        });
    }

    /* -------------------------------------------------------------- mailings */

    function loadMailings() {
        B.api('/admin/mailings').then(function (res) {
            var rows = el('mailingRows');
            if (!res.ok) { rows.innerHTML = '<tr><td colspan="5" class="muted">Could not load mailings.</td></tr>'; return; }

            var list = res.data.mailings || [];
            if (!list.length) {
                rows.innerHTML = '<tr><td colspan="5" class="muted">Nothing yet. Write one above.</td></tr>';
                return;
            }

            rows.innerHTML = list.map(function (m) {
                var sent = m.sent_at;
                var delivered = sent
                    ? B.escapeHtml(String(m.sent_count)) + ' sent' +
                      (m.failed_count ? ', <strong>' + B.escapeHtml(String(m.failed_count)) + ' failed</strong>' : '')
                    : '<span class="muted">draft</span>';

                var actions = sent
                    ? (m.failed_count
                        ? '<button class="btn btn-quiet" data-resend="' + B.escapeHtml(m.id) + '">Retry failures</button>'
                        : '<span class="muted">done</span>')
                    : '<button class="btn btn-quiet" data-edit="' + B.escapeHtml(m.id) + '">Edit</button> ' +
                      '<button class="btn" data-send="' + B.escapeHtml(m.id) + '">Send</button>';

                return '<tr>' +
                    '<td>' + B.escapeHtml(m.subject) + '</td>' +
                    '<td class="muted">' + B.escapeHtml(B.formatDateTime(m.created_at)) + '</td>' +
                    '<td class="muted">' + (sent ? B.escapeHtml(B.formatDateTime(sent)) : '—') + '</td>' +
                    '<td>' + delivered + '</td>' +
                    '<td>' + actions + '</td>' +
                    '</tr>';
            }).join('');
        });
    }

    function editorValues() {
        return {
            id: el('mailingId').value || '',
            subject: (el('subject').value || '').trim(),
            body_text: (el('bodyText').value || '').trim(),
            body_html: (el('bodyHtml').value || '').trim()
        };
    }

    function loadIntoEditor(m) {
        el('mailingId').value = m.id || '';
        el('subject').value = m.subject || '';
        el('bodyText').value = m.body_text || '';
        el('bodyHtml').value = m.body_html || '';
        el('editorTitle').textContent = m.id ? 'Editing draft' : 'New mailing';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    el('newDraft').addEventListener('click', function () {
        loadIntoEditor({});
        clearNotice();
    });

    el('saveDraft').addEventListener('click', function () {
        var v = editorValues();
        if (!v.subject || !v.body_text || !v.body_html) {
            say('warn', 'A subject and both versions of the body are required before saving.');
            return;
        }

        var path = v.id ? '/admin/mailings/save' : '/admin/mailings';
        B.api(path, { method: 'POST', body: v }).then(function (res) {
            if (res.status === 409) { say('warn', 'That mailing has already been sent and cannot be edited.'); return; }
            if (!res.ok) { say('warn', 'Could not save.'); return; }
            if (res.data.id) el('mailingId').value = res.data.id;
            el('editorTitle').textContent = 'Editing draft';
            say('ok', 'Saved. Nothing has been sent.');
            loadMailings();
        });
    });

    el('sendTest').addEventListener('click', function () {
        var id = el('mailingId').value;
        if (!id) { say('warn', 'Save the draft first, then send yourself a test.'); return; }

        B.api('/admin/mailings/test', { method: 'POST', body: { id: id } }).then(function (res) {
            if (res.ok && res.data.ok) say('ok', 'Test sent to your own address. Read it in a real inbox before sending to the list.');
            else say('warn', 'Test failed: ' + B.escapeHtml((res.data && res.data.error) || 'unknown error'));
        });
    });

    /* Sending is the one irreversible action here, so it asks, and it asks with
     * the subject line and the recipient count in the question. */
    document.addEventListener('click', function (event) {
        var sendId = event.target.getAttribute && event.target.getAttribute('data-send');
        var editId = event.target.getAttribute && event.target.getAttribute('data-edit');
        var resendId = event.target.getAttribute && event.target.getAttribute('data-resend');

        if (editId) {
            B.api('/admin/mailings/get?id=' + encodeURIComponent(editId)).then(function (res) {
                if (!res.ok || !res.data.mailing) { say('warn', 'Could not load that draft.'); return; }
                loadIntoEditor(res.data.mailing);
                clearNotice();
            });
            return;
        }

        if (sendId) {
            var count = el('statActive').textContent;
            if (!window.confirm('Send to ' + count + ' confirmed subscribers?\n\nThis cannot be undone.')) return;
            event.target.disabled = true;
            B.api('/admin/mailings/send', { method: 'POST', body: { id: sendId } }).then(function (res) {
                if (!res.ok) { say('warn', 'Send failed.'); return; }
                say('ok', 'Sent to ' + res.data.sent + '. Failed: ' + res.data.failed + '.');
                loadMailings();
            });
            return;
        }

        if (resendId) {
            if (!window.confirm('Retry only the addresses that failed?')) return;
            event.target.disabled = true;
            B.api('/admin/mailings/resend', { method: 'POST', body: { id: resendId } }).then(function (res) {
                if (!res.ok) { say('warn', 'Resend failed.'); return; }
                say('ok', 'Retried. Sent: ' + res.data.sent + '. Still failing: ' + res.data.failed + '.');
                loadMailings();
            });
        }
    });

    boot();
})();
