import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, demoTranscript, generateCues, validateCues, toSrt, srtTime, normalizeWords, splitTranslation, basicFillerIds, charCount, japaneseBoundaries, wrapText, type Transcript } from "./captions.ts";
test("Japanese line wrapping keeps compound nouns and particles together",()=>{
  const text="今日は東京都の美術館について詳しくお話ししていきます。";
  const wrapped=wrapText(text,2,"ja");
  assert.equal(wrapped.replace(/\n/g,""),text);
  if(wrapped.includes("\n")) assert.ok(japaneseBoundaries(text).has(wrapped.indexOf("\n")));
  assert.ok(!wrapped.includes("東京\n都"));assert.ok(!/\n(?:の|は|が|を|に|です|ます)/u.test(wrapped));
});
test("Japanese caption grouping ignores suggested breaks inside compounds",()=>{
  const text="東京都の美術館で作品を見ました。次の展示も楽しみです。";
  const words=Array.from(text).map((text,id)=>({id,text,start:id*.15,end:(id+1)*.15}));
  const t:Transcript={words,text,language:"japanese",duration:10,breaks:[1,2,3,6],fillerIds:[],refined:true};
  const cues=generateCues(t,{...defaults,maxLength:18});
  assert.equal(cues.map(c=>c.text.replace(/\n/g,"")).join(""),text);
  assert.ok(cues[0].text.replace(/\n/g,"").startsWith("東京都の"));
  assert.equal(validateCues(cues,10),null);
});
test("all words survive grouping, with length and duration limits",()=>{
  const t=demoTranscript();
  for(const maxLength of [10,22,42,80]){
    const cues=generateCues(t,{...defaults,maxLength,maxDuration:3});
    assert.equal(validateCues(cues,t.duration),null);
    assert.deepEqual(cues.flatMap(c=>c.wordIds),t.words.map(w=>w.id));
    for(const c of cues){assert.ok(charCount(c.text.replace(/\n/g," "))<=maxLength||c.warning);assert.ok(c.end-c.start<=3||c.warning);}
  }
});
test("filler removal preserves meaningful words and original timing",()=>{
  const t=demoTranscript(),cues=generateCues(t,{...defaults,fillers:"remove"});
  assert.deepEqual(cues.flatMap(c=>c.wordIds),t.words.filter(w=>!t.fillerIds.includes(w.id)).map(w=>w.id));
  assert.equal(cues[0].start,t.words[1].start);
  assert.deepEqual(basicFillerIds([{id:1,text:"like",start:0,end:1},{id:2,text:"Um,",start:1,end:2}]),[2]);
});
test("gap fill respects pause threshold, next start, and max duration",()=>{
  const t:Transcript={words:[{id:0,text:"Hello.",start:0,end:1},{id:1,text:"Again.",start:1.8,end:2.5},{id:2,text:"Later.",start:8,end:9}],text:"",language:"en",duration:10,breaks:[],fillerIds:[],refined:false};
  const speech=generateCues(t,defaults),filled=generateCues(t,{...defaults,timing:"fill",maxGap:1});
  assert.equal(speech[0].end,1);assert.equal(filled[0].end,1.8);assert.equal(filled[1].end,2.5);
  assert.equal(generateCues(t,{...defaults,timing:"fill",maxGap:10,maxDuration:2})[1].end,3.8);
});
test("Unicode captions retain text without adding spaces in Japanese",()=>{
  const t:Transcript={words:Array.from("今日はいい天気です。").map((text,id)=>({id,text,start:id*.2,end:(id+1)*.2})),text:"",language:"japanese",duration:3,breaks:[],fillerIds:[],refined:false};
  const cues=generateCues(t,{...defaults,maxLength:4});assert.equal(cues.map(c=>c.text).join(""),"今日はいい天気です。");assert.ok(cues.every(c=>charCount(c.text)<=4));
});
test("translated chunks remain in source window and within length limit",()=>{
  const c={id:"a",start:1,end:5,text:"",wordIds:[1]};const parts=splitTranslation(c,"Estas palabras cuentan una historia maravillosa.",{...defaults,maxLength:20},"es");
  assert.equal(parts[0].start,1);assert.equal(parts.at(-1)?.end,5);assert.equal(validateCues(parts,6),null);assert.ok(parts.every(c=>charCount(c.text.replace(/\n/g," "))<=20));
});
test("SRT rounding carries milliseconds and rejects overlapping edits",()=>{
  assert.equal(srtTime(59.9996),"00:01:00,000");assert.equal(srtTime(3600.001),"01:00:00,001");
  const cues=[{id:"a",start:0,end:1,text:"字幕",wordIds:[]},{id:"b",start:.9,end:2,text:"Next",wordIds:[]}];assert.match(validateCues(cues,3)||"",/overlaps/);
  assert.match(toSrt(cues.slice(0,1)),/^1\r\n00:00:00,000 --> 00:00:01,000\r\n字幕\r\n$/);
});
test("normalization removes invalid words and clamps nonmonotonic timestamps",()=>{
  const words=normalizeWords([{word:"a",start:0,end:1},{word:"b",start:.5,end:.8},{word:"",start:2,end:3},{word:"c",start:NaN,end:4}]);assert.equal(words.length,2);assert.ok(words[1].start>=words[0].end);assert.ok(words[1].end>words[1].start);
});
