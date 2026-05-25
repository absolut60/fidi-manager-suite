import { RUOLI_CONTATTO } from "@/lib/ruoli-contatto";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RuoloSelectProps {
  value: string;
  onChange: (value: string) => void;
  label?: boolean;
}

export function RuoloSelect({ value, onChange, label = true }: RuoloSelectProps) {
  const predefiniti = RUOLI_CONTATTO.slice(0, -1) as readonly string[];
  const isCustom = value !== "" && !predefiniti.includes(value);
  const selectValue = isCustom ? "Altro..." : value;

  return (
    <div className="space-y-1.5">
      {label && <Label>Ruolo</Label>}
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === "Altro...") {
            onChange(isCustom ? value : " ");
          } else {
            onChange(v);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Seleziona ruolo" />
        </SelectTrigger>
        <SelectContent>
          {RUOLI_CONTATTO.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(selectValue === "Altro..." || isCustom) && (
        <Input
          placeholder="Specifica ruolo..."
          value={isCustom ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      )}
    </div>
  );
}
