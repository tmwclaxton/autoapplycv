export interface ProfileDocument {
    id: number;
    category: string;
    category_label: string;
    title: string;
    original_filename: string;
    mime_type: string;
    file_size: number;
    file_size_label: string;
    notes: string | null;
    created_at: string | null;
    download_url: string;
}

export interface DocumentCategoryOption {
    value: string;
    label: string;
}
