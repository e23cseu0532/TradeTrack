"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AiAssistantProps = {
  onAsk: (query: string) => void;
  isLoading: boolean;
};

export default function AiAssistant({ onAsk, isLoading }: AiAssistantProps) {
  const [query, setQuery] = useState("");
  const { toast } = useToast();

  const handleAsk = () => {
    if (!query.trim()) {
      toast({
        variant: "destructive",
        title: "Empty Query",
        description: "Please enter a question to ask the assistant.",
      });
      return;
    }
    onAsk(query);
    setQuery(""); // Clear input after asking
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !isLoading) {
      handleAsk();
    }
  };

  return (
    <div className="flex w-full items-center space-x-2">
      <Input
        type="text"
        placeholder="e.g., 'Which stocks are high-risk?'"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyPress={handleKeyPress}
        disabled={isLoading}
        className="text-base"
      />
      <Button 
        onClick={handleAsk} 
        disabled={isLoading}
        className="transition-transform duration-300 ease-in-out hover:scale-105"
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
            Asking...
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Ask AI
          </>
        )}
      </Button>
    </div>
  );
}
