import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CategoriaSegmento } from "@/lib/use-categorie-segmento";

const NESSUNO = "__none__";

export function SegmentoSelect({
  items,
  value,
  onChange,
  placeholder = "Nessuno",
}: {
  items: CategoriaSegmento[] | undefined;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  return (
    <Select value={value || NESSUNO} onValueChange={(v) => onChange(v === NESSUNO ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NESSUNO}>{placeholder}</SelectItem>
        {(items ?? []).map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.parent_id ? `— ${i.label}` : i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
