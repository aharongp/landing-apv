const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const icons=require('../public/icons');
const landing=require('../services/landingPage');
test('icon labels preserve readable text without interpreting user text as HTML',()=>{
 const html=icons.renderText('[icon:lock] VIN <private> & "saved"');
 assert.match(html,/data-icon="lock"/);assert.match(html,/aria-hidden="true"/);
 assert.match(html,/VIN &lt;private&gt; &amp; &quot;saved&quot;/);
 assert.equal(icons.renderText('Toyota & Honda'),'Toyota &amp; Honda');
 assert.equal(icons.renderText('[icon:unknown]'),'[icon:unknown]');
 assert.equal(icons.svg('constructor'),'');
});
test('all translated icon tokens resolve in both languages, including filled rating stars',()=>{
 const window={};vm.runInNewContext(fs.readFileSync('public/marketing-i18n.js','utf8'),{window});
 for(const lang of ['es','en'])for(const text of Object.values(window.APV_I18N[lang])){
  for(const [,name] of text.matchAll(/\[icon:([a-z-]+)\]/g))assert.ok(icons.svg(name),name);
 }
 assert.equal((icons.renderText('[icon:star-filled]'.repeat(5)).match(/<svg /g)||[]).length,5);
 assert.match(icons.svg('heart-filled'),/apv-icon-filled/);
 assert.doesNotMatch(icons.svg('heart'),/apv-icon-filled/);
});
test('home, campaign and catalog ship SVGs and local icon assets; country values remain intact',()=>{
 const home=fs.readFileSync('public/index.html','utf8');
 for(const html of [home,landing(home),fs.readFileSync('public/catalog.html','utf8')]){
  assert.match(html,/src="\/icons.js"/);assert.match(html,/href="\/icons.css"/);
  assert.match(html,/<svg class="apv-icon/);assert.doesNotMatch(html,/\[icon:/);
  assert.match(html,/<option value="\+58">\+58 \(Venezuela\)<\/option>/);
  assert.doesNotMatch(html,/[\u{1F000}-\u{1FAFF}]/u);
 }
});
