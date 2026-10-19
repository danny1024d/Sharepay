import createElement from "lucide/dist/esm/createElement.mjs";
import ArrowDown from "lucide/dist/esm/icons/arrow-down.mjs";
import ArrowLeft from "lucide/dist/esm/icons/arrow-left.mjs";
import ArrowLeftRight from "lucide/dist/esm/icons/arrow-left-right.mjs";
import ArrowRight from "lucide/dist/esm/icons/arrow-right.mjs";
import BookOpen from "lucide/dist/esm/icons/book-open.mjs";
import CalendarDays from "lucide/dist/esm/icons/calendar-days.mjs";
import Calculator from "lucide/dist/esm/icons/calculator.mjs";
import Camera from "lucide/dist/esm/icons/camera.mjs";
import CircleDollarSign from "lucide/dist/esm/icons/circle-dollar-sign.mjs";
import Delete from "lucide/dist/esm/icons/delete.mjs";
import ExternalLink from "lucide/dist/esm/icons/external-link.mjs";
import List from "lucide/dist/esm/icons/list.mjs";
import LocateFixed from "lucide/dist/esm/icons/locate-fixed.mjs";
import LogIn from "lucide/dist/esm/icons/log-in.mjs";
import LogOut from "lucide/dist/esm/icons/log-out.mjs";
import Map from "lucide/dist/esm/icons/map.mjs";
import MapPin from "lucide/dist/esm/icons/map-pin.mjs";
import Maximize2 from "lucide/dist/esm/icons/maximize-2.mjs";
import Minus from "lucide/dist/esm/icons/minus.mjs";
import Mountain from "lucide/dist/esm/icons/mountain.mjs";
import MountainSnow from "lucide/dist/esm/icons/mountain-snow.mjs";
import Package from "lucide/dist/esm/icons/package.mjs";
import PanelBottomOpen from "lucide/dist/esm/icons/panel-bottom-open.mjs";
import Pencil from "lucide/dist/esm/icons/pencil.mjs";
import Plus from "lucide/dist/esm/icons/plus.mjs";
import Receipt from "lucide/dist/esm/icons/receipt.mjs";
import RefreshCw from "lucide/dist/esm/icons/refresh-cw.mjs";
import Repeat from "lucide/dist/esm/icons/repeat.mjs";
import Scan from "lucide/dist/esm/icons/scan.mjs";
import ScanLine from "lucide/dist/esm/icons/scan-line.mjs";
import SearchX from "lucide/dist/esm/icons/search-x.mjs";
import Star from "lucide/dist/esm/icons/star.mjs";
import Trash from "lucide/dist/esm/icons/trash.mjs";
import X from "lucide/dist/esm/icons/x.mjs";

const icons = {
  "arrow-down": ArrowDown,
  "arrow-left": ArrowLeft,
  "arrow-left-right": ArrowLeftRight,
  "arrow-right": ArrowRight,
  "book-open": BookOpen,
  "calendar-days": CalendarDays,
  calculator: Calculator,
  camera: Camera,
  "circle-dollar-sign": CircleDollarSign,
  delete: Delete,
  "external-link": ExternalLink,
  list: List,
  "locate-fixed": LocateFixed,
  "log-in": LogIn,
  "log-out": LogOut,
  map: Map,
  "map-pin": MapPin,
  "maximize-2": Maximize2,
  minus: Minus,
  mountain: Mountain,
  "mountain-snow": MountainSnow,
  package: Package,
  "panel-bottom-open": PanelBottomOpen,
  pencil: Pencil,
  plus: Plus,
  receipt: Receipt,
  "refresh-cw": RefreshCw,
  repeat: Repeat,
  scan: Scan,
  "scan-line": ScanLine,
  "search-x": SearchX,
  star: Star,
  "trash-2": Trash,
  x: X
};

export function renderIcons(root = document) {
  root.querySelectorAll("[data-lucide]").forEach(element => {
    const icon = icons[element.dataset.lucide];
    if (!icon) return;
    const svg = createElement(icon, {
      class: element.getAttribute("class") || "",
      "aria-hidden": "true",
      focusable: "false"
    });
    element.replaceWith(svg);
  });
}