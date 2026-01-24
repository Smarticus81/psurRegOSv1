import React from 'react';
import Editor from "@monaco-editor/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/theme-provider";

interface TemplateEditorProps {
    value: string;
    onChange: (value: string | undefined) => void;
    variables?: string[];
    readOnly?: boolean;
}

export function TemplateEditor({ value, onChange, variables = [], readOnly = false }: TemplateEditorProps) {
    const { theme } = useTheme();

    return (
        <div className="h-full flex flex-col gap-2">
            {variables.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs p-2 bg-muted/30 rounded-md">
                    <span className="font-semibold text-muted-foreground">Available Variables:</span>
                    {variables.map(v => (
                        <Badge key={v} variant="outline" className="font-mono text-[10px] bg-primary/5 text-primary border-primary/20">
                            {`{${v}}`}
                        </Badge>
                    ))}
                </div>
            )}
            <Card className="flex-1 overflow-hidden border-muted shadow-sm">
                <Editor
                    height="100%"
                    defaultLanguage="markdown"
                    value={value}
                    onChange={onChange}
                    theme={theme === "dark" ? "vs-dark" : "light"}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                        wordWrap: 'on',
                        readOnly,
                        padding: { top: 16, bottom: 16 },
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        cursorBlinking: "smooth",
                        lineNumbers: "on",
                        renderLineHighlight: "all",
                    }}
                />
            </Card>
        </div>
    );
}
