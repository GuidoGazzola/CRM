export function formatCuit(cuit: string): string {
    if (!cuit) return '';
    const cleaned = cuit.replace(/\D/g, '');
    if (cleaned.length === 11) {
        return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 10)}-${cleaned.slice(10)}`;
    }
    return cuit;
}
