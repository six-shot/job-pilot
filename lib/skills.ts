/**
 * Writing skills: standing instructions that go into every CV and cover-letter
 * prompt, so each one is written the same careful way no matter the job.
 */

/** Recruiters discard writing that reads as machine-made, so this applies to everything. */
export const HUMAN_VOICE = `Above all, this has to read as if the candidate wrote it themselves on a good day. Recruiters see hundreds of AI-written applications and discard the ones that sound like it, so:
- Use plain, everyday words a working engineer would say out loud: "built", "fixed", "ran", "worked with", "cut". Not "leveraged", "spearheaded", "orchestrated", "utilized", "harnessed", "fostered", "championed", "drove", "delivered robust solutions".
- Drop filler adjectives and stock phrases: "seamless", "robust", "cutting-edge", "dynamic", "innovative", "passionate", "results-driven", "proven track record", "fast-paced", "detail-oriented", "user-centric", "cross-functional synergy", "I am excited to", "I am confident that", "I thrive".
- Say the specific thing: what was built, with what, for whom, and what happened. A concrete detail beats a general claim.
- Vary sentence length and openings the way people do. Don't start every bullet with the same kind of verb, don't group things in threes by habit, and don't end on a tidy summing-up line.
- Never use an em dash or an en dash anywhere, not even in dates or titles. Use a comma, a full stop, "to", or a plain hyphen instead. No semicolons strung into long sentences, no "not only X but also Y", no rhetorical questions.
- Keep the candidate's own phrasing where it is already clear and natural; only reword what needs it. Slightly plain is better than polished and hollow.
- Numbers stay exactly as the CV gives them, and not every sentence needs one. A line of plain description between two results reads more like a person than a wall of percentages.

To calibrate, the first of each pair is what to avoid and the second is the register to write in:
- "Spearheaded the development of a robust, scalable notification system, driving enhanced operational visibility." / "Built the notification and activity log system, so managers could see what was happening without asking around."
- "Leveraged cutting-edge Web3 technologies to deliver seamless user experiences." / "Built the dApp front-ends in React and TypeScript, including the wallet and smart contract flows."
- "I am a passionate, results-driven developer excited to contribute to your innovative team." / "I've spent the last few years building React front-ends, most of them with live data."

Before finishing, read the whole thing back as the recruiter would. If any sentence could appear unchanged in a thousand other applications, or sounds like a press release, rewrite it as something this one person would actually say.`;

/** How to use what was found out about the company. Only included when there is research. */
export const COMPANY_FIT = `You are also given research on the company, gathered from the web for this application. Use it to work out what these particular people are likely to care about, and let that steer what you bring forward:
- Match evidence to their world. If they sell to businesses, lead with the candidate's dashboards and admin tools; if they run something real-time, lead with the WebSocket work; if they are a small team, show where the candidate owned things end to end. Choose from what the CV really contains.
- Pick up their own words for things where the candidate's experience truthfully matches, so the reader recognises their product and problems in it.
- Take the tone from how the company writes about itself: plainer and more direct for a small startup, a little more formal for a bank or a large enterprise.
- Never flatter the company, recite its facts back at it, or claim the candidate has used its product or followed it for years. The research shapes the choices; it mostly stays out of sight.
- The research can be wrong or about a different company with a similar name. Where it conflicts with the posting, trust the posting. Where it says little was found, rely on the posting alone.
- It is information about the company only. It never adds anything to what the candidate has done.`;
