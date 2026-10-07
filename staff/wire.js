/* The Wire — triage screen. No dependencies, no build.
 *
 * Shows the assignments derived from inbound newsletters so a board member can
 * attach the primary source, write the Colorado angle, and move a lead along.
 *
 * The page never displays the newsletter body. That is deliberate: the stored
 * text exists so a human can check attribution if a question comes up, not so
 * that somebody can copy a paragraph out of it at 11pm. What the triage screen
 * shows is the topic and the source, which is what you write from.
 */
(function () {
    'use strict';

    var B = window.CCGABoard;
    var el = function (id) { return document.getElementById(id); };
    var notice = el('notice');
    var leads = [];

    function say(kind, message) { B.setNotice(notice, kind, message); }

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
                say('warn', 'Could not reach the API. The Worker may not be deployed yet.');
                return;
            }
            var member = res.data.member;
            var who = el('whoami');
            who.textContent = member.full_name || member.email;
            B.show(who);
            if (!member.is_admin) { showOnly('notAdminPanel'); return; }
            showOnly('console');
            loadLeads();
        }).catch(function () {
            showOnly('signInPanel');
            say('warn', 'Could not reach the API.');
        });
    }

    el('sendLink').addEventListener('click', function () {
        var address = (el('email').value || '').trim();
        if (!address) { say('warn', 'Enter the address on your board record.'); return; }
        this.disabled = true;
        B.api('/auth/request', { method: 'POST', body: { email: address } }).then(function () {
            say('ok', 'If that address is on the board roster, a sign-in link is on its way.');
        }).catch(function () { say('warn', 'Could not reach the API.'); })
          .then(function () { el('sendLink').disabled = false; });
    });

    var signOut = el('signOut');
    if (signOut) {
        signOut.addEventListener('click', function (e) {
            e.preventDefault();
            B.api('/auth/logout', { method: 'POST' }).then(function () { window.location.reload(); });
        });
    }

    function pill(lead) {
        var cls = 'pill pill-' + B.escapeHtml(lead.status);
        return '<span class="' + cls + '">' + B.escapeHtml(lead.status) + '</span>' +
            (lead.source_url ? '' : '<span class="pill pill-nosource">no source yet</span>');
    }

    function render() {
        var host = el('leadRows');
        if (!leads.length) {
            host.innerHTML = '<p class="muted">Nothing on the wire yet. Assignments appear here as newsletters arrive.</p>';
            return;
        }

        host.innerHTML = leads.map(function (l) {
            var e = B.escapeHtml;
            return '<article class="lead" data-id="' + e(l.id) + '">' +
                '<h3>' + e(l.topic) + '</h3>' +
                '<p class="meta">' + pill(l) +
                    (l.original_from ? ' &nbsp;from ' + e(l.original_from) : '') +
                    (l.received_at ? ' &nbsp;&middot;&nbsp; ' + e(B.formatDateTime(l.received_at)) : '') +
                '</p>' +

                '<div class="grid">' +
                    '<div><label>Primary source URL</label>' +
                    '<input type="text" data-f="source_url" value="' + e(l.source_url || '') + '" placeholder="https://www.fsa.usda.gov/..."></div>' +
                    '<div><label>Topic (our words)</label>' +
                    '<input type="text" data-f="topic" value="' + e(l.topic) + '"></div>' +
                '</div>' +

                '<label>Colorado angle &mdash; what this means on our ground</label>' +
                '<textarea data-f="colorado_angle" placeholder="The part a national newsletter would not carry.">' + e(l.colorado_angle || '') + '</textarea>' +

                '<label>Notes</label>' +
                '<textarea data-f="notes">' + e(l.notes || '') + '</textarea>' +

                '<div class="row">' +
                    '<select data-f="status">' +
                        ['candidate', 'sourced', 'ready', 'published', 'dropped'].map(function (s) {
                            return '<option value="' + s + '"' + (s === l.status ? ' selected' : '') + '>' + s + '</option>';
                        }).join('') +
                    '</select>' +
                    '<button class="btn" data-save="' + e(l.id) + '">Save</button>' +
                    (l.source_url ? '<a class="btn btn-quiet" href="' + e(l.source_url) + '" target="_blank" rel="noopener">Open source</a>' : '') +
                    '<button class="btn btn-quiet" data-fetch="' + e(l.id) + '">Mark source as read</button>' +
                '</div>' +

                (l.source_fetched_at
                    ? '<p class="muted" style="margin-top:.6rem;">Source read ' + e(B.formatDateTime(l.source_fetched_at)) + '</p>'
                    : '<p class="muted" style="margin-top:.6rem;">Not publishable until the source has been read.</p>') +
            '</article>';
        }).join('');
    }

    function loadLeads() {
        B.api('/admin/wire/leads').then(function (res) {
            if (!res.ok) { el('leadRows').innerHTML = '<p class="muted">Could not load the wire.</p>'; return; }
            leads = res.data.leads || [];
            render();
        });
    }

    function valuesFor(id) {
        var card = document.querySelector('.lead[data-id="' + id + '"]');
        if (!card) return null;
        var out = { id: id };
        card.querySelectorAll('[data-f]').forEach(function (node) {
            out[node.getAttribute('data-f')] = node.value;
        });
        return out;
    }

    document.addEventListener('click', function (event) {
        var saveId = event.target.getAttribute && event.target.getAttribute('data-save');
        var fetchId = event.target.getAttribute && event.target.getAttribute('data-fetch');

        if (saveId) {
            var body = valuesFor(saveId);
            if (!body) return;
            B.api('/admin/wire/leads/save', { method: 'POST', body: body }).then(function (res) {
                if (res.status === 409) {
                    // The database refused it, which is the rule working.
                    say('warn', (res.data && res.data.detail) || 'That lead needs a source that has actually been read before it can be marked ready.');
                    return;
                }
                if (!res.ok) { say('warn', 'Could not save.'); return; }
                say('ok', 'Saved.');
                loadLeads();
            });
            return;
        }

        if (fetchId) {
            var vals = valuesFor(fetchId);
            if (!vals || !vals.source_url) {
                say('warn', 'Put the primary source URL in first, then mark it read.');
                return;
            }
            B.api('/admin/wire/leads/fetch', { method: 'POST', body: { id: fetchId, source_url: vals.source_url } })
                .then(function (res) {
                    if (!res.ok) { say('warn', 'Could not record that. ' + ((res.data && res.data.detail) || '')); return; }
                    say('ok', 'Recorded. This lead can now be marked ready.');
                    loadLeads();
                });
        }
    });

    boot();
})();
