"use client";

import { CalendarPlus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface CalendarOptions {
  google: string;
  outlook: string;
  ics: string;
}

/**
 * Put one demo in the student's own calendar: Google or Outlook open with the
 * event filled in; the .ics file is there for Apple Calendar and anything else.
 */
export function AddToCalendar({ options, size = "sm", variant = "outline" }: { options: CalendarOptions; size?: "sm" | "default"; variant?: "outline" | "default" | "ghost" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant}>
          <CalendarPlus /> Add to calendar <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem asChild>
          <a href={options.google} target="_blank" rel="noreferrer">
            Google Calendar
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={options.outlook} target="_blank" rel="noreferrer">
            Outlook
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={options.ics}>Download .ics file (Apple, others)</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
