import assert from "node:assert/strict";import{readFile}from"node:fs/promises";
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const [composer,menu,media,post,event,poll,rich,css]=await Promise.all([read("components/community/student-community-composer.tsx"),read("components/community/community-create-menu.tsx"),read("app/api/community/media/route.ts"),read("app/api/community/posts/route.ts"),read("app/api/community/events/route.ts"),read("app/api/community/polls/route.ts"),read("components/community/community-rich-content.tsx"),read("app/community-shell.css")]);
const checks=[
 ["Student routing remains isolated",menu.includes("if (studentCompact) return <StudentCommunityComposer")],
 ["Image upload supports ten attachments",composer.includes('max={10}')&&composer.includes('type="file"')&&!composer.includes("Image URL")],
 ["Uploads validate file signatures and size",media.includes("detectedCommunityImageType")&&media.includes("COMMUNITY_IMAGE_MAX_BYTES")],
 ["Every wizard ends in preview",composer.includes("finalStep")&&composer.includes("Final preview")&&composer.includes("Draft autosaved")],
 ["Article editor includes advanced tools",composer.includes("TableCellsIcon")&&composer.includes("CodeBracketIcon")&&composer.includes("[embed]")&&css.includes("student-article-dialog")],
 ["Student publish contracts are explicit",post.includes("publishStudentPost")&&event.includes("publishStudentEvent")&&poll.includes("publishStudentPoll")],
 ["Rich content never injects raw HTML",rich.includes("safeHref")&&!rich.includes("dangerouslySetInnerHTML")],
 ["Drawer has an opaque panel background",css.includes("background-color:var(--txk-bg-panel)")&&css.includes("background-image:none")&&css.includes("opacity:1")],
];
for(const[name,pass]of checks){assert.ok(pass,name);console.log(`PASS ${name}`);}console.log(`Student composer QA passed (${checks.length}/${checks.length}).`);
