
"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { OptionDataPoint } from "@/app/types/option-chain";
import { cn } from "@/lib/utils";
import AnimatedCounter from "./AnimatedCounter";

type OptionChainTableProps = {
  title: "Calls" | "Puts";
  data: OptionDataPoint[];
  isLoading: boolean;
  atmStrike: number | null;
};

export default function OptionChainTable({
  title,
  data,
  isLoading,
  atmStrike,
}: OptionChainTableProps) {
  const formatNumber = (val: number) => {
    if (val === null || val === undefined) return "-";
    return val.toLocaleString("en-IN");
  };

  const renderCellContent = (value: number | null | undefined, precision = 2) => {
    if (isLoading) return <Skeleton className="h-4 w-16" />;
    if (value === null || value === undefined) return "-";
    return <AnimatedCounter value={value} precision={precision} />;
  };

  // Sort strikes consistently
  const sortedData = [...data].sort((a, b) => a.strikePrice - b.strikePrice);

  return (
    <div className="w-full overflow-hidden rounded-lg border">
      <h3
        className={cn(
          "p-4 text-center text-xl font-bold text-white",
          title === "Calls" ? "bg-green-600" : "bg-red-600"
        )}
      >
        {title}
      </h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">OI</TableHead>
              <TableHead className="text-center">IV</TableHead>
              <TableHead className="text-center">LTP</TableHead>
              <TableHead className="text-center font-bold">Strike</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              [...Array(7)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="text-center">
                    <Skeleton className="h-4 w-20 mx-auto" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Skeleton className="h-4 w-12 mx-auto" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Skeleton className="h-4 w-16 mx-auto" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Skeleton className="h-4 w-20 mx-auto" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading &&
              sortedData.map((item) => (
                <TableRow
                  key={item.strikePrice}
                  className={cn(
                    "transition-colors h-12",
                    item.strikePrice === atmStrike
                      ? "bg-primary/10"
                      : "hover:bg-muted/50"
                  )}
                >
                  <TableCell className="text-center font-mono text-xs">
                    {renderCellContent(item.oi, 0)}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs">
                    {renderCellContent(item.iv)}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs">
                    {renderCellContent(item.ltp)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-center font-bold font-mono",
                      item.strikePrice === atmStrike
                        ? "text-primary text-base scale-110"
                        : "text-foreground"
                    )}
                  >
                    {formatNumber(item.strikePrice)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
       {!isLoading && sortedData.length === 0 && (
         <div className="p-8 text-center text-muted-foreground">
            No data available for the selected criteria.
         </div>
       )}
    </div>
  );
}
