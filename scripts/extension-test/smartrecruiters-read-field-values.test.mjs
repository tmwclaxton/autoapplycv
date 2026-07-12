#!/usr/bin/env node
/**
 * SmartRecruiters oneclick-ui keeps native controls in open shadow roots.
 * read_field_values must traverse shadow DOM like inventory does.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FORM_HEURISTICS_PATH, HTML_DIR } from '../form-corpus/lib/paths.mjs';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const heuristicsScript = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
    .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');

function bootHeuristics(dom) {
    const context = {
        globalThis: dom.window,
        window: dom.window,
        document: dom.window.document,
        console,
        setTimeout,
        clearTimeout,
        Node: dom.window.Node,
        ShadowRoot: dom.window.ShadowRoot,
        CSS: dom.window.CSS,
        HTMLElement: dom.window.HTMLElement,
        Element: dom.window.Element,
        Event: dom.window.Event,
        InputEvent: dom.window.InputEvent,
        FocusEvent: dom.window.FocusEvent,
        MouseEvent: dom.window.MouseEvent,
    };

    context.globalThis = context;
    vm.runInNewContext(heuristicsScript, context);

    return context.AutoCVApplyFormHeuristics;
}

function attachOpenShadow(host, innerHtml) {
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = innerHtml;

    return shadow;
}

function buildOneclickShadowFixture() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://jobs.smartrecruiters.com/oneclick-ui/' });
    const { document } = dom.window;
    const form = document.createElement('oc-oneclick-form');
    document.body.appendChild(form);

    const ocInput = document.createElement('oc-input');
    ocInput.setAttribute('formcontrolname', 'firstName');
    form.appendChild(ocInput);

    const ocShadow = attachOpenShadow(ocInput, '<spl-input id="first-name-input" value="Toby"></spl-input>');
    const splInput = ocShadow.querySelector('spl-input');
    splInput.value = 'Toby';
    const splShadow = attachOpenShadow(
        splInput,
        '<input type="text" id="first-name-input" value="">',
    );

    const checkboxHost = document.createElement('spl-checkbox');
    form.appendChild(checkboxHost);
    const checkboxShadow = attachOpenShadow(
        checkboxHost,
        '<input type="checkbox" id="noPolicy" checked>',
    );

    return { dom, splShadow, checkboxShadow };
}

function testSyntheticShadowFixture() {
    const { dom } = buildOneclickShadowFixture();
    const heuristics = bootHeuristics(dom);
    const controls = heuristics.collectReadableFieldValueControls(dom.window.document);

    assert(controls.length >= 2, `expected shadow controls, got ${controls.length}`);

    const firstName = controls.find((control) => control.id === 'first-name-input');

    assert(firstName, 'first-name-input missing from readable controls');
    assert(firstName.value === 'Toby', `expected Toby, got ${firstName.value}`);

    const consent = controls.find((control) => control.id === 'noPolicy');

    assert(consent?.checked === true, 'noPolicy checkbox should read as checked');
}

function testResolveSmartRecruitersPhoneByDataTest() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'https://jobs.smartrecruiters.com/oneclick-ui/company/Motocol/publication/402e763c-f9a0-485c-ba48-ca0ea68e2eb4',
    });
    const { document } = dom.window;
    document.body.innerHTML = `
        <div data-test="personal-info-phone">
            <spl-phone-field id="spl-form-element_5"></spl-phone-field>
        </div>
        <div data-test="personal-info-location">
            <input type="text" id="spl-form-element_10" />
        </div>
    `;
    const phoneHost = document.querySelector('spl-phone-field');
    const shadow = phoneHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<input type="tel" id="phone-inner" />';

    const heuristics = bootHeuristics(dom);
    const phoneTarget = heuristics.resolveTargetFromDom(document, {
        id: 'spl-form-element_5',
        type: 'tel',
        sr_data_test: 'personal-info-phone',
    }, 'tel');

    assert(phoneTarget?.type === 'tel', 'phone ref should resolve to tel input');

    const locationTarget = heuristics.resolveTargetFromDom(document, {
        id: 'spl-form-element_10',
        type: 'text',
        sr_data_test: 'personal-info-location',
    }, 'text');

    assert(locationTarget?.id === 'spl-form-element_10', 'location ref should stay on location input');
}

function testMotocolFixtureHtml() {
    const fixturePath = join(
        HTML_DIR,
        'https-jobs-smartrecruiters-com-oneclick-ui-company-motocol-publication-402e763c-.html',
    );
    const html = readFileSync(fixturePath, 'utf8');
    const dom = new JSDOM(html, { url: 'https://jobs.smartrecruiters.com/oneclick-ui/company/Motocol/publication/402e763c-f9a0-485c-ba48-ca0ea68e2eb4' });
    const heuristics = bootHeuristics(dom);
    const deepControls = heuristics.collectReadableFieldValueControls(dom.window.document);

    assert(Array.isArray(deepControls), 'collectReadableFieldValueControls should return an array');
}

function testSmartRecruitersPhoneFill() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'https://jobs.smartrecruiters.com/oneclick-ui/company/Motocol/publication/402e763c-f9a0-485c-ba48-ca0ea68e2eb4',
    });
    const { document } = dom.window;
    const form = document.createElement('oc-oneclick-form');
    document.body.appendChild(form);
    const phoneHost = document.createElement('spl-phone-field');
    phoneHost.id = 'spl-form-element_5';
    phoneHost.setAttribute('value', '{"country":"US"}');
    form.appendChild(phoneHost);

    const shadow = phoneHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<input type="tel" id="phone-input" value="" />';

    const heuristics = bootHeuristics(dom);
    const telInput = shadow.querySelector('#phone-input');

    return heuristics.setFieldValue(telInput, '+447700900123').then((filled) => {
        assert(filled === true, 'expected smartrecruiters phone fill to succeed');

        const controls = heuristics.collectReadableFieldValueControls(document);
        const phoneControl = controls.find((control) => control.id === 'phone-input');

        assert(phoneControl, 'phone control missing from readable controls');
        assert(
            phoneControl.value.replace(/\D/g, '').includes('7700900123'),
            `expected national number in readback, got ${phoneControl.value}`,
        );
    });
}

testSyntheticShadowFixture();
testResolveSmartRecruitersPhoneByDataTest();
testMotocolFixtureHtml();
testSmartRecruitersPhoneFill().then(() => {
    console.log('smartrecruiters-read-field-values.test.mjs: ok');
});
