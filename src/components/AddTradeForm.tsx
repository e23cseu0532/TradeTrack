"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { format } from "date-fns";
import { Clock, PlusCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { StockRecord } from "@/app/types/trade";
import { useToast } from "@/hooks/use-toast";
import { Combobox } from "@/components/ui/combobox";

const stockSymbols = [
    "360ONE", "3MINDIA", "ABB", "ACC", "AIAENG", "APLAPOLLO", "AUBANK", "AARTIIND", "AADHARHFC", "AAVAS", 
    "ABBOTINDIA", "ADANIENSOL", "ADANIENT", "ADANIGREEN", "ADANIPORTS", "ADANIPOWER", "ATGL", "ABCAPITAL", 
    "ABFRL", "ABREL", "AEGISCHEM", "AFFLE", "AFCONS", "AJANTPHARM", "AKUMS", "ALKYLAMINE", "ALEMBICPH", 
    "ALIVUS", "ALKEM", "ALOKINDS", "AMARAJABAT", "AMBER", "AMBUJACEM", "ANANDRATHI", "ANANTRAJ", 
    "ANGELONE", "APOLLOHOSP", "APOLLOTYRE", "APARINDS", "APTUS", "ASHOKLEY", "ASAHIINDIA", "ASTERDM", 
    "ASTRAZEN", "ATUL", "AUROPHARMA", "AVANTIFEED", "DMART", "AXISBANK", "BLS", "BASF", "BEML", 
    "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BAJAJHLDNG", "BAJAJHFL", "BALKRISIND", "BALRAMCHIN", 
    "BANDHANBNK", "BANKBARODA", "BANKINDIA", "MAHABANK", "BATAINDIA", "BAYERCROP", "BERGEPAINT", "BDL", 
    "BEL", "BHEL", "BPCL", "BHARTIARTL", "BHARTIHEXA", "BIKAJI", "BIOCON", "BSOFT", "BLUEDART", "BLUESTARCO", 
    "BBTC", "BOSCHLTD", "BRAINBEES", "BRIGADE", "BRITANNIA", "MAPMYINDIA", "CCL", "CESC", "CAMPUS", 
    "CANFINHOME", "CANBK", "CGCL", "CARBORUNIV", "CASTROLIND", "CEAT", "CENTRALBK", "CENTURYPLY", "CERA", 
    "CGPOWER", "CHALET", "CHAMBLFERT", "CHENNPETRO", "CHOLAHLDNG", "CHOLAFIN", "CIPLA", "CUB", "CLEAN", 
    "COALINDIA", "COCHINSHIP", "COFORGE", "COHANCE", "COLPAL", "CONCOR", "COROMANDEL", "CRAFTSMAN", 
    "CREDITACC", "CROMPTON", "CUMMINSIND", "CYIENT", "DCMSHRIRAM", "DLF", "DABUR", "DALBHARAT", 
    "DATAPATTNS", "DEEPAKFERT", "DEEPAKNTR", "DELHIVERY", "DEVYANI", "DIVISLAB", "DIXON", "DOMS", 
    "LALPATHLAB", "DRREDDY", "EIDPARRY", "EIHOTEL", "EICHERMOT", "ELGIEQUIP", "EMAMILTD", "EMCURE", 
    "ENDURANCE", "ENGINERSIN", "ESCORTS", "ETERNALLTD", "EXIDEIND", "FEDERALBNK", "FACT", "FINCABLES", 
    "FINPIPE", "FSL", "FIVESTAR", "FORTIS", "GAIL", "GMRAIRPORT", "GETD", "GILLETTE", "GLAND", "GLAXO", 
    "GLENMARK", "GLOBALHEAL", "GPIL", "GODREJAGRO", "GODREJCP", "GODREJIND", "GODREJPROP", "GRANULES", 
    "GRAPHITE", "GRASIM", "GRAVITA", "GESHIP", "GAEL", "FLUOROCHEM", "GUJGASLTD", "GMDCLTD", "GNFC", 
    "GPPL", "GSPL", "HEG", "HDFCAMC", "HDFCBANK", "HDFCLIFE", "HFCL", "HBLPOWER", "HAPPSTMNDS", 
    "HAVELLS", "HEROMOTOCO", "HSCL", "HINDALCO", "HAL", "HINDCOPPER", "HINDPETRO", "HINDUNILVR", 
    "HINDZINC", "POWERINDIA", "HONASA", "HONAUT", "HYUNDAI", "ICICIBANK", "ICICIGI", "ICICIPRULI", "IDBI", 
    "IDFCFIRSTB", "IFCI", "IIFL", "INOXINDIA", "IRB", "IRCON", "ITI", "ITC", "INDEGENE", "INDIANB", 
    "IEX", "INDHOTEL", "IOC", "IOB", "IRCTC", "IRFC", "IREDA", "INDIAMART", "INDIGOPNTS", "INDUSINDBK", 
    "INDUSTOWER", "NAUKRI", "INFY", "INTELLECT", "INDIGO", "IGI", "INVENTURUS", "IPCALAB", "JBCHEPHARM", 
    "JKCEMENT", "JKTYRE", "JBMA", "JMFINANCIL", "JSWENERGY", "JSWINFRA", "JSWSTEEL", "JPPOWER", "J&KBANK", 
    "JIOFIN", "JINDALSAW", "JSL", "JINDALSTEL", "JUBLFOOD", "JUBLINGREA", "JUBLPHARMA", "JWL", "JUSTDIAL", 
    "JYOTHYLAB", "JYOTICNC", "KPRMILL", "KPITTECH", "KEI", "KNRCON", "KAJARIACER", "KALPATPOWR", 
    "KALYANKJIL", "KANSAINER", "KARURVYSYA", "KAYNES", "KEC", "KFINTECH", "KIRLOSBROS", "KIRLOSENG", 
    "KOTAKBANK", "KIMS", "LTF", "LTTS", "LICHSGFIN", "LTFOODS", "LTIM", "LT", "LATENTVIEW", "LAURUSLABS", 
    "LEMONTREE", "LICI", "LINDEINDIA", "LLOYDSME", "LODHA", "LUPIN", "MMTC", "MTARTECH", "MGL", "M&MFIN", 
    "M&M", "MAHSEAMLES", "MANAPPURAM", "MRPL", "MANKIND", "MARICO", "MARUTI", "MASTEK", "MFSL", 
    "MAXHEALTH", "MAZDOCK", "METROPOLIS", "MINDACORP", "MOTILALOFS", "MSUMI", "MPHASIS", "MCX", 
    "MUTHOOTFIN", "NBCC", "NCC", "NHPC", "NLCINDIA", "NMDC", "NSLNISP", "NTPCGREEN", "NTPC", "NH", 
    "NATIONALUM", "NAVA", "NAVINFLUOR", "NESTLEIND", "NETWORK18", "NETWEB", "NEULANDLAB", "NEWGEN", 
    "NAM-INDIA", "NUVAMA", "OBEROIRLTY", "ONGC", "OIL", "OLAELECTRIC", "OLECTRA", "OFSS", "POLICYBZR", 
    "PCBL", "PGEL", "PIIND", "PNCINFRA", "PNBHOUSING", "PTCIL", "PVRINOX", "PAGEIND", "PATANJALI", 
    "PERSISTENT", "PETRONET", "PFIZER", "PHOENIXLTD", "PIDILITIND", "PPLPHARMA", "POLYCAB", "POLYMED", 
    "POONAWALLA", "PFC", "POWERGRID", "PRAJIND", "PREMIERENE", "PRESTIGE", "PNB", "RRKABEL", "RBLBANK", 
    "RHIM", "RITES", "RTNINDIA", "RVNL", "RAILTEL", "RAINBOW", "RKFORGE", "RCF", "RAYMOND", "RECLTD", 
    "REDINGTON", "RELIANCE", "RELINFRA", "RPOWER", "ROUTE", "SBICARD", "SBILIFE", "SJVN", "SKFINDIA", 
    "SRF", "SAGILITY", "SAILIFE", "SAMMAAN", "MOTHERSON", "SAPPHIRE", "SARDAEN", "SAREGAMA", "SCHAEFFLER", 
    "SCHNEIDER", "SCI", "SHREECEM", "RENUKA", "SHRIRAMFIN", "SHYAMMETL", "SIEMENS", "SIGNATURE", "SOBHA", 
    "SOLARINDS", "SONACOMS", "SONATSOFTW", "STARHEALTH", "SBIN", "SAIL", "SWSOLAR", "SUMICHEM", 
    "SUNPHARMA", "SUNTV", "SUNDARMFIN", "SUNDRMFAST", "SUPREMEIND", "SUZLON", "SWANENERGY", "SWIGGY", 
    "SYNGENE", "SYRMA", "TBOTEK", "TANLA", "TATACHEM", "TATACOMM", "TCS", "TATACONSUM", "TATAELXSI", 
    "TATAINVEST", "TATAMOTORS", "TATAPOWER", "TATASTEEL", "TATATECH", "TTML", "TECHNOE", "TEJASNET", 
    "THERMAX", "TIMKEN", "TITAN", "TITAGARH", "TORNTPHARM", "TORNTPOWER", "TRIL", "TRENT", "TRIDENT", 
    "TRIVENI", "TRITURBINE", "TIINDIA", "TVSMOTOR", "UCOBANK", "UNOMINDA", "UPL", "UTIAMC", "UNIONBANK", 
    "UBL", "UNITDSPR", "USHAMART", "VGUARD", "VALOREST", "VTL", "VBL", "VEDL", "MANYAVAR", "VIJAYA", 
    "VISHALMEGA", "IDEA", "VOLTAS", "WAAREEENER", "WELCORP", "WELSPUNLIV", "WESTLIFE", "WHIRLPOOL", 
    "WIPRO", "WOCKPHARMA", "YESBANK", "ZFCVINDIA", "ZEEL", "ZENTEC", "ZENSARTECH", "ZYDUSLIFE", "ECLERX"
].map(symbol => ({ value: symbol, label: symbol }));


const formSchema = z.object({
  stockSymbol: z.string().min(1, { message: "Please select a stock symbol." }),
  entryPrice: z.coerce.number().positive({ message: "Entry price must be a positive number." }),
  stopLoss: z.coerce.number().positive({ message: "Stop loss must be a positive number." }),
  targetPrice1: z.coerce.number().positive({ message: "Target price 1 must be a positive number." }),
  targetPrice2: z.coerce.number().optional(),
  targetPrice3: z.coerce.number().optional(),
  positionalTargetPrice: z.coerce.number().optional(),
});

type AddTradeFormProps = {
  onAddTrade: (trade: Omit<StockRecord, "id" | "dateTime">) => void;
};

export default function AddTradeForm({ onAddTrade }: AddTradeFormProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      stockSymbol: "",
      entryPrice: "" as any,
      stopLoss: "" as any,
      targetPrice1: "" as any,
      targetPrice2: "" as any,
      targetPrice3: "" as any,
      positionalTargetPrice: "" as any,
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    onAddTrade(values);
    form.reset();
     toast({
      title: "Stock Added",
      description: `${values.stockSymbol} has been added to your records.`,
    });
  }

  return (
    <div>
      <div className="mb-6 rounded-md border bg-muted/50 p-3">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          {currentTime ? (
            <span>{format(currentTime, "PPP p")}</span>
          ) : (
            <span>Loading time...</span>
          )}
        </div>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="stockSymbol"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Stock Symbol</FormLabel>
                <Combobox
                  options={stockSymbols}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Select a stock..."
                  searchPlaceholder="Search for a stock..."
                  notFoundMessage="No stock found."
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="entryPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entry Price</FormLabel>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">₹</span>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} className="pl-7"/>
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="stopLoss"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stop Loss</FormLabel>
                 <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">₹</span>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} className="pl-7"/>
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="targetPrice1"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Price 1</FormLabel>
                 <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">₹</span>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} className="pl-7"/>
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

           <FormField
            control={form.control}
            name="targetPrice2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Price 2 (Optional)</FormLabel>
                 <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">₹</span>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : +e.target.value)} className="pl-7"/>
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="targetPrice3"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Price 3 (Optional)</FormLabel>
                 <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">₹</span>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : +e.target.value)} className="pl-7"/>
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="positionalTargetPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Positional Target Price (Optional)</FormLabel>
                 <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">₹</span>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : +e.target.value)} className="pl-7"/>
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" size="lg">
            <PlusCircle />
            Add Stock Record
          </Button>
        </form>
      </Form>
    </div>
  );
}
