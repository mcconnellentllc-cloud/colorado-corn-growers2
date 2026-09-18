/* CCGA Board Portal — shared front-end helpers. No dependencies, no build. */

(function () {
    'use strict';

    var API = (window.CCGA_BOARD && window.CCGA_BOARD.API_BASE) || '';

    /* All API calls carry the session cookie. */
    function api(path, options) {
        var opts = options || {};
        var init = {
            method: opts.method || 'GET',
            credentials: 'include',
            headers: {}
        };
        if (opts.body !== undefined) {
            init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(opts.body);
        }
        return fetch(API + path, init).then(function (response) {
            return response.json()
                .catch(function () { return {}; })
                .then(function (data) {
                    return { status: response.status, ok: response.ok, data: data };
                });
        });
    }

    /* Escape before inserting anything server-supplied into the page. */
    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* "September 15, 2026 at 5:00 PM MDT" */
    function formatDateTime(iso) {
        if (!iso) return '';
        var date = new Date(iso);
        if (isNaN(date.getTime())) return iso;
        try {
            return new Intl.DateTimeFormat('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short',
                timeZone: 'America/Denver'
            }).format(date);
        } catch (err) {
            return date.toISOString();
        }
    }

    function show(el) { if (el) el.hidden = false; }
    function hide(el) { if (el) el.hidden = true; }

    function setNotice(el, kind, message) {
        if (!el) return;
        el.className = 'notice notice-' + kind;
        el.textContent = message;
        el.hidden = false;
    }

    window.CCGABoard = {
        api: api,
        escapeHtml: escapeHtml,
        formatDateTime: formatDateTime,
        setNotice: setNotice,
        show: show,
        hide: hide
    };
})();
