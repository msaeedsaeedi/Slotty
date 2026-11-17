"use client";

import { useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { answerSurveyAction } from "@/app/actions/feedback";
import { SURVEY_PROMPTS, type SurveyPromptId } from "@/domain/analytics";
import { Button } from "@/components/ui/button";

// A tiny store: an action's success hands its prompt to `openSurvey`, the host shows it.
let current: SurveyPromptId | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openSurvey(prompt: SurveyPromptId) {
  current = prompt;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const LABELS = ["Very hard", "Hard", "OK", "Easy", "Very easy"];

/**
 * The one-question survey shown after a booking, reschedule or mark submission
 * (at most once per 14 days per question). Answers are stored without the user.
 */
export function SurveyHost() {
  const prompt = useSyncExternalStore(subscribe, () => current, () => null);
  const [thanks, setThanks] = useState(false);
  if (!prompt) return null;

  const close = () => {
    current = null;
    setThanks(false);
    emit();
  };
  const answer = (score: number | null) => {
    void answerSurveyAction(prompt, score);
    if (score === null) close();
    else {
      setThanks(true);
      setTimeout(close, 1500);
    }
  };

  return (
    <aside
      aria-labelledby="survey-question"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-sm rounded-xl border bg-card p-4 text-sm shadow-lg sm:right-4 sm:left-auto sm:mx-0"
    >
      {thanks ? (
        <p role="status">Thanks — that helps us improve Slotty.</p>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <p id="survey-question" className="flex-1 font-medium">
              {SURVEY_PROMPTS[prompt]}
            </p>
            <Button variant="ghost" size="icon" className="-mt-1 -mr-2 size-7" aria-label="Not now" onClick={() => answer(null)}>
              <X />
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1" role="group" aria-label="Your answer, from 1 (very hard) to 5 (very easy)">
            {LABELS.map((label, i) => (
              <Button key={label} variant="outline" size="sm" className="h-auto flex-col gap-0 px-1 py-1.5" onClick={() => answer(i + 1)} aria-label={`${i + 1}: ${label}`}>
                <span className="text-base font-semibold tabular-nums">{i + 1}</span>
                <span className="text-[10px] leading-tight text-muted-foreground">{label}</span>
              </Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Anonymous: not linked to your account.</p>
        </>
      )}
    </aside>
  );
}
