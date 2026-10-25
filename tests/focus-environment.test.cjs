const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path')
const exportsObject={}
vm.compileFunction(ts.transpileModule(fs.readFileSync('src/features/pomodoro/lib/focusEnvironment.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,['exports'])(exportsObject)
const {normalizeFocusAppearance,focusBackgrounds,focusTracks,FocusSoundPlayer}=exportsObject
function mediaFixture(){
 const states=[],media=[],positions=[]
 const player=new FocusSoundPlayer(status=>states.push(status),()=>{const item={paused:true,plays:0,fail:false,hold:false,currentTime:0,duration:NaN,readyState:0,play(){this.plays++;if(this.fail)return Promise.reject(Error('NotAllowedError'));this.paused=false;return this.hold?new Promise(resolve=>this.resolve=resolve):Promise.resolve()},pause(){this.paused=true},removeAttribute(){this.src=''},load(){}};media.push(item);return item},position=>positions.push(position))
 return {player,states,media,positions}
}
test('focus appearance defaults to a ring, validates untrusted saved values and keeps explicit legacy choices',()=>{
 const defaults=normalizeFocusAppearance(null);assert.equal(defaults.counter,'ring');assert.equal(defaults.background,'none');assert.equal(defaults.volume,.25)
 assert.deepEqual(normalizeFocusAppearance({font:'mono',counter:'digital'}),{...defaults,counter:'digital'})
 const invalid=normalizeFocusAppearance({font:'<script>',counter:'unknown',background:'https://outside.test',track:'../secret',volume:NaN});assert.deepEqual(invalid,defaults)
 assert.equal(normalizeFocusAppearance({volume:50}).volume,1);assert.equal(normalizeFocusAppearance({volume:-1}).volume,0)
})
test('every curated background and track is shipped locally with credits instead of relying on external playback',()=>{
 assert.equal(focusBackgrounds.length,5);assert.equal(focusTracks.length,5)
 for(const scene of focusBackgrounds.filter(item=>item.src))for(const asset of [scene.src,scene.thumbnail]){
  const file=path.resolve('public','.'+asset);assert.ok(file.startsWith(path.resolve('public')+path.sep));const bytes=fs.readFileSync(file);assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');assert.ok(scene.author);assert.match(scene.source,/^https:\/\/unsplash.com\//)
 }
 const credits=fs.readFileSync('public/focus/CREDITS.txt','utf8')
 for(const track of focusTracks){const bytes=fs.readFileSync(path.join('public',track.src));assert.ok(bytes.length>100000);assert.equal(bytes.subarray(0,3).toString(),'ID3');assert.ok(credits.includes(track.title));assert.ok(credits.includes(track.source));assert.ok(credits.includes(track.author));assert.ok(credits.includes(track.licenseUrl));assert.ok(track.duration>20)}
 assert.match(credits,/By Attribution 4.0/);assert.match(credits,/loudness-normalized/)
})
test('sound begins only on play, loops at a bounded volume and resumes the same track after pause',async()=>{
 const f=mediaFixture();assert.equal(f.media.length,0)
 await f.player.play(focusTracks[0],.25);assert.equal(f.media.length,1);assert.equal(f.media[0].loop,true);assert.equal(f.media[0].preload,'none');assert.equal(f.media[0].volume,.25)
 f.player.setVolume(5);assert.equal(f.media[0].volume,1);f.player.pause();assert.equal(f.media[0].paused,true);await f.player.play(focusTracks[0],.4);assert.equal(f.media.length,1);assert.equal(f.media[0].plays,2)
 await f.player.play(focusTracks[1],.4);assert.equal(f.media[0].src,'');assert.equal(f.media[0].onerror,null);assert.equal(f.media[1].src,focusTracks[1].src);f.player.dispose();assert.equal(f.media[1].src,'');assert.equal(f.states.at(-1),'idle')
})
test('pending play promises cannot resurrect a disposed or replaced music source',async()=>{
 const f=mediaFixture();await f.player.play(focusTracks[0],.2);f.media[0].hold=true
 const pending=f.player.play(focusTracks[0],.2);f.player.dispose();const old=f.media[0];old.resolve();await pending;assert.equal(old.paused,true);assert.equal(f.states.at(-1),'idle')
 await f.player.play(focusTracks[0],.2);f.media[1].hold=true;const next=f.player.play(focusTracks[0],.2);await f.player.play(focusTracks[1],.3);f.media[1].resolve();await next;assert.equal(f.media[1].paused,true);assert.equal(f.media[2].paused,false);assert.equal(f.states.at(-1),'playing');f.player.dispose()
})
test('network and permission failures show a retryable state and release broken media',async()=>{
 const f=mediaFixture();await f.player.play(focusTracks[0],.2);f.media[0].fail=true;await f.player.play(focusTracks[0],.2);assert.equal(f.states.at(-1),'error');assert.equal(f.media[0].paused,true)
 f.media[0].fail=false;await f.player.play(focusTracks[0],.2);assert.equal(f.states.at(-1),'playing')
 f.media[0].onerror();assert.equal(f.states.at(-1),'error');assert.equal(f.media[0].src,'');await f.player.play(focusTracks[0],.2);assert.equal(f.media.length,2);assert.equal(f.states.at(-1),'playing');f.player.dispose()
 const states=[],unsupported=new FocusSoundPlayer(status=>states.push(status),()=>{throw Error('Audio unsupported')});await unsupported.play(focusTracks[0],.2);assert.equal(states.at(-1),'error');unsupported.dispose()
})

test('a position can be chosen before play without a download and applied when metadata becomes available',async()=>{
 const f=mediaFixture();f.player.select(focusTracks[0]);f.player.seek(127)
 assert.equal(f.media.length,0);assert.equal(f.positions.at(-1).currentTime,127);assert.equal(f.positions.at(-1).duration,focusTracks[0].duration)
 await f.player.play(focusTracks[0],.25);const media=f.media[0];assert.equal(media.currentTime,0)
 media.ontimeupdate();assert.equal(f.positions.at(-1).currentTime,127,'early time events do not overwrite a queued seek')
 media.duration=249;media.readyState=1;media.onloadedmetadata();assert.equal(media.currentTime,127);assert.equal(f.positions.at(-1).duration,249)
 media.currentTime=129.2;media.ontimeupdate();assert.equal(f.positions.at(-1).currentTime,129.2)
 f.player.pause();f.player.seek(186);assert.equal(media.currentTime,186);assert.equal(media.paused,true);assert.equal(media.plays,1,'scrubbing paused media never starts it')
 await f.player.play(focusTracks[0],.25);assert.equal(media.currentTime,186);assert.equal(media.plays,2);f.player.dispose()
})

test('seeks are bounded, loading retries keep the chosen position, and stale events cannot update another track',async()=>{
 const f=mediaFixture();f.player.select(focusTracks[1]);f.player.seek(Infinity);assert.equal(f.positions.at(-1).currentTime,0)
 f.player.seek(-10);assert.equal(f.positions.at(-1).currentTime,0);f.player.seek(9999);assert.equal(f.positions.at(-1).currentTime,focusTracks[1].duration)
 await f.player.play(focusTracks[1],.25);const old=f.media[0],lateMetadata=old.onloadedmetadata,lateTick=old.ontimeupdate
 old.readyState=1;old.duration=400;old.onloadedmetadata();assert.equal(old.currentTime,400)
 f.player.seek(90);old.onerror();assert.equal(old.onloadedmetadata,null);assert.equal(old.ontimeupdate,null)
 await f.player.play(focusTracks[1],.25);const retry=f.media[1];retry.readyState=1;retry.duration=400;retry.onloadedmetadata();assert.equal(retry.currentTime,90)
 f.player.select(focusTracks[4]);assert.equal(f.positions.at(-1).track,'fireplace');assert.equal(f.positions.at(-1).currentTime,0);assert.equal(retry.paused,true)
 lateMetadata();lateTick();assert.equal(f.positions.at(-1).track,'fireplace');assert.equal(f.positions.at(-1).currentTime,0)
 f.player.dispose();assert.deepEqual(f.positions.at(-1),{track:null,currentTime:0,duration:0});f.player.seek(20);assert.equal(f.media.length,2)
})
