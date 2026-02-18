"use client";

import { LinkWithIcon } from "components/LinkWithIcon";
import { RiSparkling2Line } from "react-icons/ri";

import { useEffect, useState } from "react";
import { usePollAILogs } from "utils/hooks/useAI";

export const AILink = () => {
  const [text, setText] = useState("");
  const [newText, setNewText] = useState("AI Plugins");

  const mutateAILogs = (logs: any) => {
    setNewText("AI iterated 🎉");
  };

  usePollAILogs(mutateAILogs);

  useEffect(() => {
    let index = 0;

    const interval = setInterval(() => {
      setText(newText.slice(0, index + 1));
      index++;

      if (index === newText.length) {
        clearInterval(interval);
      }
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, [newText]);

  return (
    <LinkWithIcon href="/ai" icon={RiSparkling2Line} className="w-full">
      <div className="flex justify-between items-center w-full">
        <span className="text-xs text-muted-foreground break-all">{text}</span>
      </div>
    </LinkWithIcon>
  );
};
