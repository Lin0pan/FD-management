# Handout — documents DF receives

Everything in this folder is written **for DF, not for a developer**, and may be printed and handed
over as it stands. That sets three rules the rest of `docs/` does not follow:

- **German**, addressing DF directly, and free of jargon. No file paths a reader cannot act on, no
  npm scripts, no architecture vocabulary.
- **Short enough to print.** One page each. A document nobody carries to the counter is not a
  handout.
- **Placeholders are marked in italics** — a name, a contact, a decision not yet taken. An unfilled
  placeholder is honest; an invented answer is not.

Keeping these true is a real cost, so the folder stays small on purpose. A document only belongs
here if DF cannot get the answer from the screen in front of them.

| Document                                         | Purpose                                                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`betriebsanleitung.md`](./betriebsanleitung.md) | Starting, stopping, where the data lives, backup, restore, the egg allowance, the balance and how a payment is put right, changing a customer number, what to do when something breaks |

The technical counterpart is
[chapter 7 — deployment view](../architecture/07-deployment-view.md); where the two disagree about a
command or a path, chapter 7 is the one to trust and this folder is the one to correct.
