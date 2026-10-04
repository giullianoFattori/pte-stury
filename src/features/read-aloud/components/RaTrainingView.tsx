import { normalizeText } from '../../../domain/scoring/shared/normalizeText';

type Props = {
  text: string;
  phraseGroups?: string[];
  stressWords?: string[];
  showPhraseHelp: boolean;
  showStressHelp: boolean;
  onPhraseHelpChange: (value: boolean) => void;
  onStressHelpChange: (value: boolean) => void;
};

export function RaTrainingView({
  text, phraseGroups, stressWords, showPhraseHelp, showStressHelp,
  onPhraseHelpChange, onStressHelpChange,
}: Props) {
  const stressTargets = new Set((stressWords ?? []).map(normalizeText));
  const groups = showPhraseHelp && phraseGroups?.length ? phraseGroups : [text];

  return (
    <div>
      <div className="ra-training-controls">
        <label>
          <input type="checkbox" checked={showPhraseHelp}
            onChange={event => onPhraseHelpChange(event.target.checked)} /> Show phrasing help
        </label>
        <label>
          <input type="checkbox" checked={showStressHelp}
            onChange={event => onStressHelpChange(event.target.checked)} /> Show stress targets
        </label>
      </div>
      {(showPhraseHelp || showStressHelp) && (
        <>
          <h3>Training view</h3>
          <p>Phrase boundaries and emphasized words are practice suggestions.</p>
          <p className="ra-training-passage">
            {groups.map((group, groupIndex) => (
              <span className="ra-phrase-group" key={groupIndex}>
                {groupIndex > 0 && <span aria-label="phrase boundary"> / </span>}
                {group.split(/(\s+)/).map((word, wordIndex) => (
                  showStressHelp && stressTargets.has(normalizeText(word))
                    ? <strong className="ra-stress-word" key={wordIndex}>{word}</strong>
                    : word
                ))}
              </span>
            ))}
          </p>
        </>
      )}
    </div>
  );
}
