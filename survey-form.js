/* Annual meeting survey — shared form behaviour.
 *
 * One implementation used by the form on the home page and the longer one on
 * Pages/annual-meeting.html, so the two cannot drift apart.
 *
 * The important part: a grower who fills this in never hits a dead end. The
 * answers are posted to the Worker when it is up. When it is not — which is
 * the case until it is deployed — the same answers are folded into an email
 * that opens pre-written, so one click still delivers them. Nothing a grower
 * types is ever thrown away because our back end is not ready.
 */
(function () {
    'use strict';

    var API_BASE = 'https://board-api.cologrowers.com';   /* keep in step with board/config.js */
    var SURVEY = 'annual-meeting-2027';
    var OFFICE = 'office@cologrowers.com';

    var TOWNS = { sterling: 'Sterling', yuma: 'Yuma', burlington: 'Burlington', other: 'Somewhere else' };
    var TOPICS = {
        'fsa-programs': 'FSA programs, explained',
        'marketing-ai': 'Marketing with AI',
        banking: 'Making the bank work for you'
    };

    function val(form, name) {
        var f = form.querySelector('[name="' + name + '"]');
        return f && f.value ? f.value.trim() : '';
    }

    function collect(form) {
        var loc = form.querySelector('input[name="location"]:checked');
        return {
            survey: SURVEY,
            location: loc ? loc.value : null,
            location_other: val(form, 'location_other'),
            topics: [].slice.call(form.querySelectorAll('input[name="topics"]:checked'))
                      .map(function (i) { return i.value; }),
            comment: val(form, 'comment'),
            name: val(form, 'name'),
            county: val(form, 'county'),
            email: val(form, 'email'),
            sponsor_lead: val(form, 'sponsor_lead')
        };
    }

    function isEmpty(a) {
        return !a.location && !a.topics.length && !a.comment && !a.sponsor_lead;
    }

    /* The fallback carries the grower's actual answers, not a blank
       questionnaire. They fill it once; we do the transcribing. */
    function mailto(a) {
        var town = a.location === 'other'
            ? (a.location_other || 'somewhere else — did not say where')
            : (TOWNS[a.location] || 'no preference given');

        var lines = [
            'Where should we hold the annual meeting?',
            '    ' + town,
            '',
            'What would be worth 2 hours of your valuable time?',
            '    ' + (a.topics.length
                        ? a.topics.map(function (t) { return TOPICS[t] || t; }).join('\n    ')
                        : 'nothing picked'),
            ''
        ];
        if (a.comment) lines.push('Comments and suggestions:', '    ' + a.comment, '');
        if (a.sponsor_lead) lines.push('A business that might sponsor it:', '    ' + a.sponsor_lead, '');
        if (a.name || a.county || a.email) {
            lines.push('From:', '    ' + [a.name, a.county, a.email].filter(Boolean).join(' · '), '');
        }
        lines.push('(Sent from the survey on cologrowers.com)');

        return 'mailto:' + OFFICE
             + '?subject=' + encodeURIComponent('Annual meeting survey')
             + '&body=' + encodeURIComponent(lines.join('\n'));
    }

    function bind(form) {
        var status = form.querySelector('[data-role="status"]');
        var thanks = form.parentNode.querySelector('[data-role="thanks"]');
        var button = form.querySelector('[type="submit"]');
        var other = form.querySelector('[name="location_other"]');

        function say(message) { if (status) status.textContent = message; }

        function done() {
            form.style.display = 'none';
            if (thanks) thanks.style.display = 'block';
        }

        /* The write-in only takes text when "somewhere else" is chosen, so a
           stray entry cannot contradict a selected town. */
        if (other) {
            other.disabled = true;
            form.addEventListener('change', function (e) {
                if (e.target.name !== 'location') return;
                other.disabled = e.target.value !== 'other';
                if (other.disabled) other.value = ''; else other.focus();
            });
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var answers = collect(form);

            if (isEmpty(answers)) {
                say('Pick a town, a topic, or leave a comment — otherwise there is nothing to send.');
                return;
            }

            if (button) button.disabled = true;
            say('Sending…');

            var fallback = function () {
                say('Opening your email instead — your answers are already written in, just press send.');
                window.location.href = mailto(answers);
                if (button) button.disabled = false;
            };

            var timer = setTimeout(fallback, 6000);   /* never leave them waiting */

            fetch(API_BASE + '/survey', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(answers)
            }).then(function (r) {
                clearTimeout(timer);
                if (!r.ok) throw new Error('bad');
                done();
            }).catch(function () {
                clearTimeout(timer);
                fallback();
            });
        });
    }

    function init() {
        [].slice.call(document.querySelectorAll('form[data-survey]')).forEach(bind);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
