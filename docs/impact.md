# Impact: who Little Rhythm is for and what it changes

**In short.** Each sourced figure below has something in the app built around it. These
are design links, not results: the app has not been tested with other families.

- Young babies feed many times a day, including at night → one spoken sentence logs the
  feed and the sleep, checked on two cards.
- Night care is uneven (France, mothers' reports: 64% mother alone, 6% father alone) → the night-feed card
  counts the night feeds each parent logged.
- Both parents work (66.3% of US married-couple families with children in 2025; 73.9% of
  UK couple families with dependent children in 2021) → one live log, and the same Next up
  on both phones.

Written 3 Nov 2026 for the released app (v1.1.1). v1.2.0 (logging at a past time, growth
records, 7 and 14 day trends) is still being verified on phones, is not shipped, and is
marked where it differs. What this page says about the app matches the code and the docs
it links. What it says about the world is cited. It makes no claim about outcomes.

## 1. The problem in numbers

These are background figures about the situation a new family is in. They are not claims
about what the app does for anyone's health or sleep, and none of them is advice.

**How many babies are born each year** (live births, one year, as published):

- **EU:** 3,552,919 in 2024 (3,459,677 in 2025, flagged provisional). Eurostat,
  [*Live births and crude birth rate*, dataset tps00204, updated 27 Oct 2026](https://ec.europa.eu/eurostat/databrowser/product/view/tps00204)
  ([JSON](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tps00204?format=JSON&lang=en&geo=RO&geo=EU27_2020&sinceTimePeriod=2022)).
- **Romania:** 143,637 in 2024 (134,238 in 2025, provisional). Same Eurostat dataset.
- **England and Wales** (Scotland and Northern Ireland are not included): 585,396 in
  2025. Office for National Statistics,
  [*Births in England and Wales: 2025 (final rates)*, 8 Sep 2026](https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/bulletins/birthsummarytablesenglandandwales/2025finalrates).
- **United States:** 3,606,400 in 2025 (provisional). CDC National Center for Health
  Statistics,
  [*Births: Provisional Data for 2025*, press release "U.S. Births down 1% in 2025", 9 Apr 2026](https://cdc.gov/nchs/pressroom/releases/20260409.html).

**How often a young baby feeds and wakes** (as published by health services; background
only, not advice):

- American Academy of Pediatrics, HealthyChildren.org,
  [*How Often and How Much Should Your Baby Eat?*](https://www.healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/How-Often-and-How-Much-Should-Your-Baby-Eat.aspx)
  (updated 2024): "Breastfed newborns usually nurse every 2 hours"; "most newborns eat
  every 2 to 3 hours" when bottle-fed.
- Newcastle Hospitals NHS Foundation Trust,
  [*Sleep (infants 0-12 months)*](https://www.newcastle-hospitals.nhs.uk/services/great-north-childrens-hospital/childrens-sleep-service/sleep-infants-0-12-months/)
  (updated 20 May 2026): young babies "have small stomachs and wake up every 2-3 hours
  for a feed", and "Most babies are at least 1 year old by the time they are settled all
  night every night."

**New parents' sleep loss.** Richter, Krämer, Tang, Montgomery-Downs and Lemola,
[*Long-term effects of pregnancy and childbirth on sleep satisfaction and duration of
first-time and experienced mothers and fathers*, Sleep 42(4), 2019](https://academic.oup.com/sleep/article/42/4/zsz015/5304299):
in a population-representative German panel (2,541 women and 2,118 men who had a first,
second or third child), sleep satisfaction and duration "sharply declined with childbirth
and reached a nadir during the first 3 months postpartum". The abstract reports a sleep
duration reduction compared with before pregnancy of 62 minutes for women and 13 minutes
for men. Sleep was self-reported.

**How the care is split between two parents.** Three sources, each narrow:

- **Night care, France.** Breton et al.,
  [*Gender Inequality in Managing Childhood Sleep: Which Parent Gets up at Night?*,
  Children (Basel) 12(4), 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12025490/):
  for children aged 0 to 5, mothers from the general population (n = 1,409) reported that
  64% were cared for exclusively by the mother at night and 6% by the father. In the
  sample of 882 sleep-consultation files, the figures were 60% and 9%.
- **Childcare hours, EU.** EIGE (European Institute for Gender Equality),
  [*How couples' employment patterns shape gender inequalities in childcare and work-life
  balance in the EU*, 26 Aug 2026](https://eige.europa.eu/gender-statistics/dgs/data-talks/how-couples-employment-patterns-shape-gender-inequalities-childcare-and-work-life-balance-eu),
  CARE Survey wave 2 (2024): where both partners work full time, 37% of women and 21% of
  men provide 35 or more hours of childcare a week, for children under 12.
- **Day-to-day parenting, US.** Pew Research Center,
  [*How working parents divide family responsibilities*, 16 Jun 2026](https://www.pewresearch.org/social-trends/2026/06/16/how-working-parents-divide-family-responsibilities/):
  among married or cohabiting parents in different-sex couples who both work full time,
  52% say the mom does more of the day-to-day parenting tasks, 10% the dad, and 39% say
  they are shared about equally. These are the respondents' own views.

**How many couples both work.**

- **US:** US Bureau of Labor Statistics,
  [*Employment Characteristics of Families: 2025*, 23 Apr 2026](https://www.bls.gov/news.release/archives/famee_04232026.htm):
  in 66.3% of married-couple families with children under 18, both parents were employed.
- **UK:** Office for National Statistics,
  [*Families and the labour market, UK: 2021*, 22 Jul 2022](https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/articles/familiesandthelabourmarketengland/2021):
  "Almost three-quarters (73.9%)" of couple families with dependent children had both
  parents in employment (April to June 2021, UK; the page marked itself the latest
  release when checked on 3 Nov 2026).
- Not given: a Romania or EU-wide share of couples with a baby where both work. We did
  not find a figure we could verify.

Read together: a young baby feeds often, including at night; new parents report sleeping
less, mothers most (the German panel); in the studies above the care, and the night care,
is not evenly split; and in the US and UK counts, both parents are employed in most
families with children (66.3% in 2025, 73.9% in 2021). That is the situation the app is
built around. It does not claim to change any of it.

## 2. Who it is for, and the moment it helps

Two parents with one baby, each on their own Android phone. It is built for exactly two
caregivers and one baby.

The moment is 3 a.m.: one parent is holding the baby, the other is asleep, and in the
morning nobody is sure when she last fed, how long she slept or whose night it was.
The app is built on one untested guess: that opening a form and picking a time is the
step that gets skipped. Here the parent says it once ("she drank 90 ml twenty minutes ago,
she's asleep now"), checks the two cards and taps Confirm on each.

## 3. What changes for the couple

- **One live log.** Both phones see every feed, sleep and diaper as it is saved. Row-level
  security on every table keeps it to the family.
- **Logging with one hand.** Tap, type, or hold the mic. Muse Voice Transcribe turns the
  clip into text; the Muse Spark agent turns the text into proposals. Nothing is saved
  until a parent taps Confirm, and the app shows which steps the agent took.
- **Next up is the same on both phones.** One server engine computes the next feed, nap,
  bedtime routine and bedtime as time ranges from the log. The card and the chat read
  that same engine. They come from this baby's last seven days of log, or from the app's
  starting schedule (or a blend) when there is too little of it, and are labelled
  "Estimates from your log, not advice".
- **The night-feed split.** A card counts the feeds each parent logged between 22:00 and
  06:00 over the last seven nights. It counts logs, not who fed the baby, so it is only as
  complete as the logging.
- **The daily check-in.** Two fixed questions (mood 1 to 5, and one thing that would help
  today). A parent sees the partner's answers once they have answered the same day. The
  database enforces that, not the app. Check-ins and the night-feed counts never go to
  the AI.
- **Private and shared chat.** A parent's private thread can be read only by that parent.
- **Part of v1.2.0, not shipped and not in the v1.1.1 APK:** logging an event at a past
  time, growth records (weight, length, head size; kept for the parents' own records,
  never interpreted, never sent to the AI) and 7 and 14 day trends. They are still being
  verified on phones (3 Nov); treat them as planned until the release notes list them.

## 4. Safety: no health advice, and why that is the point

The app never gives health, medical or medication advice, and it is not a mental-health or
relationship counsellor. A health question, such as a symptom, a medicine or a feeding
amount, returns no model text at all. The app shows a fixed card, written in the app and
not by the model: "I can't help with health questions. Please contact your paediatrician
or doctor. In an emergency, call 112." The number is 112, 999 (UK) or 911 (US and
Canada), chosen from the phone's time zone. On an escalated turn, urgent signs or a
parent's crisis words turn it into "This may be an emergency", with a Call button. A log
line in the same message can still become a confirm card, since logging is not advice.

Every message is checked twice: an English and Romanian keyword list, and a Muse Spark
classifier run alongside the agent. Either one escalates, and a failed check escalates too.

Measured on our own test set (final run D, `docs/safety.md`): 335 of 335 health prompts
escalated, 92 of 92 urgent prompts got the urgent card, 17 of 17 jailbreak prompts were
handled as expected (16 declined, 1 answered with nothing leaked), and 2 of 157 non-health
prompts got the card by mistake (a fruit-puree remark and a log line; both fail safe).
Muse Spark Open graded this run's 189 text replies (2 came back ungraded): 0 health
advice, 15 borderline. That is our own set, not a guarantee.

Why this is part of the value: a parent at 3 a.m. with a worried question needs the
paediatrician or the emergency number, not a language model's guess, and an app that
pretended to be a clinician would lose the trust the rest of it depends on. What the app
can answer well is about time and coordination: what is in the log, what is next, and
whose turn it was. The cost is that it will sometimes show the card for an ordinary
sentence, and it answers no health question however harmless it looks.

## 5. Reach, honestly

- **Android only, sideloaded.** The release is an APK on GitHub Releases. There is no iOS
  app. Publishing on Google Play is a step that has not been done.
- **Languages.** The screens, buttons and the escalation card are in English only; there
  are no translations. Typed chat works in English and Romanian: the agent replies in the
  language the parent wrote, and the health keywords and the safety set cover both. Voice
  is English-first: Muse Voice Transcribe supports
  [25 languages](https://dev.meta.ai/docs/speech-to-text) and Romanian is not one of them, so the app sends the phone's language as a hint only when it is a supported one,
  and English otherwise. Romanian works typed, not reliably spoken. Other languages are
  not tested.
- **Hosting.** Data is in Supabase in Frankfurt. The Meta Model API is outside the EU
  (`SECURITY.md`). It is demo-tier hosting: chat has daily caps, and a spend breaker can
  pause chat for everyone until the next UTC day.
- **Roadmap** (`CLAUDE.md`, none of it built): more caregivers and babies, iOS, WhatsApp
  logging, EU hosting for the AI, pumping, and relationship nudges.
