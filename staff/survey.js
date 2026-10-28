/* Grower survey results — board only. No dependencies, no build.
 *
 * Everything on this screen was given to the board in confidence: the form
 * told growers their answers are not published and not shared outside the
 * association. The page reflects that — there is no export button, no share
 * link, and the counts are never fetched without an admin session behind them.
 */
(function () {
    'use strict';

    var B = window.CCGABoard;
    var SURVEY = 'annual-meeting-2027';

    var LOCATIONS = {
        sterling: 'Sterling',
        yuma: 'Yuma',
        burlington: 'Burlington',
        other: 'Somewhere else'
    };

    var TOPICS = {
        'fsa-programs': 'FSA programmes, explained',
        'marketing-ai': 'Marketing with AI',
        banking: 'Making the bank work for you'
    };

    var el = function (id) { return document.getElementById(id); };
    var notice = el('notice');

    function say(kind, message) { B.setNotice(notice, kind, message); }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function showOnly(id) {
        ['signInPanel', 'notAdminPanel', 'console'].forEach(function (name) {
            var node = el(name);
            if (node) node.hidden = (name !== id);
        });
    }

    /* A bar needs a denominator. For the town vote that is the number of people
       who picked a town, not the number of responses -- somebody who only left
       a comment should not drag every bar down. */
    function bars(counts, labels, total) {
        var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
        return keys.map(function (k) {
            var n = counts[k];
            var pct = total ? Math.round((n / total) * 100) : 0;
            return '<div style="margin-bottom:.7rem;">'
                 + '<div style="display:flex;justify-content:space-between;font-size:.92rem;">'
                 + '<span>' + esc(labels[k] || k) + '</span>'
                 + '<strong>' + n + (total ? ' &middot; ' + pct + '%' : '') + '</strong></div>'
                 + '<div style="background:#e8e3d9;border-radius:3px;height:10px;margin-top:4px;">'
                 + '<div style="background:#6a8971;height:10px;border-radius:3px;width:' + pct + '%;"></div>'
                 + '</div></div>';
        }).join('');
    }

    function sum(counts) {
        return Object.keys(counts).reduce(function (a, k) { return a + counts[k]; }, 0);
    }

    function render(r) {
        var locTotal = sum(r.locations);
        var html = '';

        html += '<p class="muted" style="margin-bottom:1.2rem;"><strong>' + r.total
             + '</strong> response' + (r.total === 1 ? '' : 's') + ' so far.</p>';

        html += '<h3>Where to hold it</h3>';
        html += locTotal
            ? bars(r.locations, LOCATIONS, locTotal)
            : '<p class="muted">Nobody has picked a town yet.</p>';

        if (r.writeIns && r.writeIns.length) {
            html += '<p class="muted" style="margin-top:.6rem;"><strong>Write-ins:</strong> '
                 + r.writeIns.map(esc).join(' &middot; ') + '</p>';
        }

        html += '<h3 style="margin-top:1.8rem;">Topics worth the day</h3>';
        html += '<p class="muted" style="font-size:.88rem;margin-bottom:.8rem;">Growers could tick '
             + 'more than one, so these add to more than the response count. The percentage is of '
             + 'everyone who answered.</p>';
        html += sum(r.topics)
            ? bars(r.topics, TOPICS, r.total)
            : '<p class="muted">No topics picked yet.</p>';

        if (r.sponsorLeads && r.sponsorLeads.length) {
            html += '<h3 style="margin-top:1.8rem;">Sponsor leads &mdash; ' + r.sponsorLeads.length + '</h3>';
            html += '<p class="muted" style="font-size:.88rem;margin-bottom:.8rem;">Businesses growers '
                 + 'named as worth a call. The grower was told we would not say they sent us unless '
                 + 'they said so, which matters when somebody picks up the phone.</p>';
            html += r.sponsorLeads.map(function (item) {
                var who = [item.name, item.county].filter(Boolean).map(esc).join(', ');
                return '<div class="source-text" style="white-space:pre-wrap;margin-top:.7rem;">'
                     + esc(item.lead)
                     + '<div class="muted" style="margin-top:.6rem;font-size:.8rem;">suggested by '
                     + (who ? esc(who) : 'someone anonymous')
                     + (item.email ? ' &middot; ' + esc(item.email) : '')
                     + '</div></div>';
            }).join('');
        }

        el('summary').innerHTML = html;

        var c = '<h3 style="margin-top:2rem;">Comments and suggestions</h3>';
        if (!r.comments || !r.comments.length) {
            c += '<p class="muted">No comments yet.</p>';
        } else {
            c += '<p class="muted" style="font-size:.88rem;">The most useful part of the form. '
               + 'Read them all before the board picks a programme.</p>';
            c += r.comments.map(function (item) {
                var who = [item.name, item.county].filter(Boolean).map(esc).join(', ');
                return '<div class="source-text" style="white-space:pre-wrap;margin-top:.8rem;">'
                     + esc(item.comment)
                     + '<div class="muted" style="margin-top:.6rem;font-size:.8rem;">'
                     + (who ? esc(who) + ' &middot; ' : 'Anonymous &middot; ')
                     + esc((item.created_at || '').slice(0, 10)) + '</div></div>';
            }).join('');
        }
        el('comments').innerHTML = c;
    }

    function load() {
        B.api('/admin/survey?survey=' + encodeURIComponent(SURVEY)).then(function (res) {
            if (!res.ok || !res.data || !res.data.results) {
                say('warn', 'Could not load the results.');
                el('summary').innerHTML = '';
                return;
            }
            render(res.data.results);
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
            load();
        });
    }

    boot();
})();
