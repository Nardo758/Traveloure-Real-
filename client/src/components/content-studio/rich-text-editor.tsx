import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bold, Italic, List, Link, Image, Heading1, Heading2, Quote } from "lucide-react";

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const [textareaRef, setTextareaRef] = useState<HTMLTextAreaElement | null>(null);

  const insertMarkdown = (before: string, after = "") => {
    if (!textareaRef) return;
    const start = textareaRef.selectionStart;
    const end = textareaRef.selectionEnd;
    const selected = content.slice(start, end);
    const newContent =
      content.slice(0, start) + before + selected + after + content.slice(end);
    onChange(newContent);
    setTimeout(() => {
      textareaRef.setSelectionRange(
        start + before.length,
        end + before.length
      );
      textareaRef.focus();
    }, 0);
  };

  const toolbarActions = [
    { icon: Heading1, label: "H1", action: () => insertMarkdown("# ") },
    { icon: Heading2, label: "H2", action: () => insertMarkdown("## ") },
    { icon: Bold, label: "Bold", action: () => insertMarkdown("**", "**") },
    { icon: Italic, label: "Italic", action: () => insertMarkdown("_", "_") },
    { icon: List, label: "List", action: () => insertMarkdown("- ") },
    { icon: Quote, label: "Quote", action: () => insertMarkdown("> ") },
    { icon: Link, label: "Link", action: () => insertMarkdown("[", "](url)") },
    { icon: Image, label: "Image", action: () => insertMarkdown("![alt](", ")") },
  ];

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-1 p-2 border-b bg-gray-50 flex-wrap">
        {toolbarActions.map(({ icon: Icon, label, action }) => (
          <Button
            key={label}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={action}
            title={label}
            type="button"
            data-testid={`button-editor-${label.toLowerCase()}`}
          >
            <Icon className="w-4 h-4" />
          </Button>
        ))}
      </div>
      <Textarea
        ref={(el) => setTextareaRef(el)}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write your content here using Markdown formatting..."
        className="min-h-[400px] rounded-none border-0 focus-visible:ring-0 resize-none font-mono text-sm"
        data-testid="input-rich-text-editor"
      />
      {content && (
        <div className="border-t p-2 bg-gray-50">
          <p className="text-xs text-gray-500">
            {content.split(/\s+/).filter(Boolean).length} words ·{" "}
            {content.length} characters
          </p>
        </div>
      )}
    </div>
  );
}
