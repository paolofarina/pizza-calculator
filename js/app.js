/* Piccoli override senza combattere Pico */

.appHeader h1 {
  margin-bottom: 0.25rem;
}

.box {
  margin-top: 1rem;
}

.muted {
  opacity: 0.75;
}

/* Risultati */
.resultBox {
  margin-top: 0.75rem;
  padding: 1rem;
}

.resultBox hr {
  margin: 0.75rem 0;
}

/* Riga salva */
.saveRow {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

/* Emoji toggle */
.emojiRow {
  display: flex;
  gap: 0.5rem;
  margin: 0.25rem 0 0.75rem 0;
}

.emojiBtn {
  width: 3rem;
  height: 3rem;
  font-size: 1.5rem;
  line-height: 1;
  border-radius: 0.75rem;
  border: 1px solid var(--muted-border-color);
  background: var(--card-background-color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.emojiBtn.active {
  border-color: var(--contrast);
  box-shadow: 0 0 0 3px rgba(0,0,0,0.08);
  transform: translateY(-1px);
}

.appFooter {
  margin-top: 1.25rem;
  padding-bottom: 1rem;
}
