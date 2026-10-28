/* Site traffic — board only. No dependencies, no build.
 *
 * Reads our own pageview counts out of D1. The one thing this screen tries
 * hard to do is not flatter us: views and visitors are shown separately,
 * because quoting views to a sponsor who assumes visitors is how a number
 * stops being honest.
 */
(function () {
    'use strict';

    var B = window.CCGABoard;
    var el = function (id) { return document.getElementById(id); };
    var notice = el('notice');

    function say(kind, message) { B.setNotice(notice, kind, message); }

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function showOnly(id) {
        ['signInPanel', 'notAdminPanel', 'console'].forEach(function (name) {
            var node = el(name);
            if (node) node.hidden = (name !== id);
        });
    }

    function bars(rows, labelKey, valueKey, max) {
        return rows.map(function (r) {
            var pct = max ? Math.round((r[valueKey] / max) * 100) : 0;
            return '<div style="margin-bottom:.7rem;">'
                 + '<div style="display:flex;justify-content:space-between;gap:1rem;font-size:.92rem;">'
                 + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
                 + esc(r[labelKey]) + '</span>'
                 + '<strong style="white-space:nowrap;">' + r[valueKey]
                 + (r.visitors !== undefined && valueKey === 'views'
                     ? ' <span style="font-weight:400;color:#5b564f;">(' + r.visitors + ' visitors)</span>' : '')
                 + '</strong></div>'
                 + '<div style="background:#e8e3d9;border-radius:3px;height:9px;margin-top:4px;">'
                 + '<div style="background:#6a8971;height:9px;border-radius:3px;width:' + pct + '%;"></div>'
                 + '</div></div>';
        }).join('');
    }

    /* A sparkline rather than a chart library. Thirty numbers do not justify a
       dependency, and this file has none. */
    function spark(series) {
        if (!series.length) return '';
        var max = Math.max.apply(null, series.map(function (d) { return d.views; })) || 1;
        return '<div style="display:flex;align-items:flex-end;gap:2px;height:70px;margin:.8rem 0;">'
             + series.map(function (d) {
                 var h = Math.max(2, Math.round((d.views / max) * 70));
                 return '<div title="' + esc(d.day) + ': ' + d.views + ' views, ' + d.visitors
                      + ' visitors" style="flex:1;background:#6a8971;height:' + h + 'px;border-radius:2px 2px 0 0;"></div>';
               }).join('')
             + '</div>'
             + '<div style="display:flex;justify-content:space-between;font-size:.78rem;color:#5b564f;">'
             + '<span>' + esc(series[0].day) + '</span>'
             + '<span>' + esc(series[series.length - 1].day) + '</span></div>';
    }

    function render(s) {
        var h = '';
        h += '<div style="display:flex;gap:2.5rem;flex-wrap:wrap;margin-bottom:.5rem;">';
        h += '<div><div style="font-size:2.4rem;font-family:Georgia,serif;color:#334539;">'
           + s.visitors + '</div><div class="muted" style="font-size:.85rem;">visitors</div></div>';
        h += '<div><div style="font-size:2.4rem;font-family:Georgia,serif;color:#334539;">'
           + s.views + '</div><div class="muted" style="font-size:.85rem;">page views</div></div>';
        h += '</div>';
        h += '<p class="muted" style="font-size:.85rem;">Since ' + esc(s.since)
           + '. A visitor is one person on one day; somebody who comes back next week counts twice.</p>';
        h += spark(s.series || []);
        el('totals').innerHTML = h;

        var pages = s.pages || [];
        var pmax = pages.length ? pages[0].views : 0;
        el('pages').innerHTML = '<h3 style="margin-top:1.8rem;">Most read</h3>'
            + (pages.length ? bars(pages, 'path', 'views', pmax)
                            : '<p class="muted">Nothing recorded yet.</p>');

        var refs = s.referrers || [];
        var rmax = refs.length ? refs[0].views : 0;
        el('referrers').innerHTML = '<h3 style="margin-top:1.8rem;">Where they came from</h3>'
            + (refs.length
                ? bars(refs, 'referrer', 'views', rmax)
                : '<p class="muted">No outside referrers yet. Links typed in or opened from a '
                  + 'bookmark show up here as nothing, which is normal.</p>');
    }

    function load() {
        var days = el('days').value;
        B.api('/admin/stats?days=' + encodeURIComponent(days)).then(function (res) {
            if (!res.ok || !res.data || !res.data.stats) {
                say('warn', 'Could not load traffic. The Worker may not be deployed yet.');
                el('totals').innerHTML = '';
                return;
            }
            render(res.data.stats);
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
            el('days').addEventListener('change', load);
            load();
        });
    }

    boot();
})();
