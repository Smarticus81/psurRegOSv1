import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { RotateCcw, History } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface Version {
    id: number;
    version: number;
    changeReason: string | null;
    createdAt: string;
    createdBy: string | null;
}

interface VersionHistoryProps {
    currentVersion: number;
    versions: Version[];
    onRollback: (version: number) => void;
}

export function VersionHistory({ currentVersion, versions, onRollback }: VersionHistoryProps) {
    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center gap-2 mb-4 px-1">
                <History className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Version History</h3>
            </div>
            <ScrollArea className="flex-1 -mr-4 pr-4">
                <div className="space-y-4 pb-4 px-1">
                    {/* Current Version Indicator */}
                    <div className="relative pl-4 border-l-2 border-primary">
                        <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-primary/10" />
                        <p className="text-sm font-medium">Version {currentVersion} (Current)</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Active now</p>
                    </div>

                    {versions.map((ver) => (
                        <div key={ver.id} className="relative pl-4 border-l-2 border-muted hover:border-muted-foreground/50 transition-colors group py-1">
                            <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-muted group-hover:bg-muted-foreground transition-colors" />
                            <div className="flex justify-between items-start gap-2">
                                <div>
                                    <p className="text-sm font-medium text-foreground/90">Version {ver.version}</p>
                                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                        {format(new Date(ver.createdAt), "MMM d, yyyy HH:mm")}
                                    </p>
                                    {ver.changeReason && (
                                        <p className="text-xs mt-1.5 text-muted-foreground italic bg-muted/30 px-2 py-1 rounded">
                                            "{ver.changeReason}"
                                        </p>
                                    )}
                                    {ver.createdBy && (
                                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                                            by {ver.createdBy}
                                        </p>
                                    )}
                                </div>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => onRollback(ver.version)}
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Rollback to v{ver.version}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                    ))}

                    {versions.length === 0 && (
                        <p className="text-xs text-muted-foreground p-4 text-center italic">No history available.</p>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
