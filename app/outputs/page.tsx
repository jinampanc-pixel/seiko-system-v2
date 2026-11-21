import { redirect } from "next/navigation";

// Retire the duplicate register; existing document lists own save/print history.
export default function Outputs(){redirect("/?business=seiko&screen=billing");}
