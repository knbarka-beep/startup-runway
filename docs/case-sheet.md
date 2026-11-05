# Case sheet: startup runway dashboard

*Nordlys Analytics ApS is fictional. All data is synthetic.*

## Problem

Each month a startup founder needs to know how long the cash will last. Investors also expect a monthly update. I wanted to build one place where the numbers come from, and then see if AI could draft the update without getting the numbers wrong.

## Approach

I wrote a brief for a fictional Danish SaaS company with a story built into the data. Claude Code wrote the code from that brief. A Python script generates the data with a fixed seed. DuckDB calculates every metric, one SQL view per file. A static website reads one exported file and makes no API calls. The cash projection runs in the browser, and a test checks it against a separate Python version within €1 a month.

For the investor updates, Claude drafts the text from a fact sheet that only holds data up to that month. A script without AI checks each draft: numbers, causes, structure and length.

## Findings

- At Sep 2026 the company has €1.579.630 and 14,3 months of runway at current burn. With the current plan, cash runs out in Feb 2028. It has to raise money during 2027.
- My first cost for a student assistant was set backwards from a target number. I recalculated it forwards from an hourly wage: €1.420 a month, down from €1.900.
- The model rounded numbers wrongly, for example €55k for €55.811. It now gets every number pre-formatted and has to copy one form.
- On the final prompt, 6 of 12 drafts passed on the first attempt and 12 of 12 after retries. The retry rule and the cost cap were set before the run, and the run was done once.
- The checker was revised twice, both times because it flagged correct text.

## What I learned

A checker needs as much testing as the thing it checks. Two of six retries came from false flags, not model errors. It also pays to fix rules and caps before a run, so the result cannot be tuned afterwards. And the AI output is a draft. A founder still has to add the reasons the data cannot show.
