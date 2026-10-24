"use client";

import { useLayoutClass } from "@/lib/use-media";
import { DeskSettingsFrame } from "./DesktopSettings";
import { DeskStudyPlan, PhoneStudyPlan } from "./StudyPlanSettings";

/**
 * /settings/plan «План повторения»: its own screen on phones (back to Settings), and from 768 a
 * sub-page of Settings — the section nav with «План повторения» current under «Повторение», the
 * page in the 640 form column. The server and hydration render the phone screen, hidden from 768 up
 * by CSS (as SettingsScreen does).
 */
export function StudyPlanScreen() {
  const layout = useLayoutClass();
  if (layout !== "compact") {
    return (
      <DeskSettingsFrame subPage>
        <DeskStudyPlan />
      </DeskSettingsFrame>
    );
  }
  return <PhoneStudyPlan />;
}
