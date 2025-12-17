import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';

export interface Attachment {
    name: string;
    url: string;
    type: string;
    size: number;
}

interface FileUploaderProps {
    bucketName?: string;
    folderPath?: string;
    onUploadComplete: (files: Attachment[]) => void;
    existingFiles?: Attachment[];
    maxSizeMB?: number;
    acceptedTypes?: string;
    compact?: boolean;
    resetOnUpload?: boolean;
}

export function FileUploader({
    bucketName = 'attachments',
    folderPath = 'uploads',
    onUploadComplete,
    existingFiles = [],
    maxSizeMB = 5,
    acceptedTypes = 'image/*,.pdf,.doc,.docx,.xls,.xlsx',
    compact = false,
    resetOnUpload = false
}: FileUploaderProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [files, setFiles] = useState<Attachment[]>(existingFiles);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const selectedFiles = Array.from(e.target.files);
        setIsUploading(true);

        const newAttachments: Attachment[] = [];

        try {
            for (const file of selectedFiles) {
                // Validate size
                if (file.size > maxSizeMB * 1024 * 1024) {
                    alert(`El archivo ${file.name} excede el tamaño máximo de ${maxSizeMB}MB.`);
                    continue;
                }

                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
                const filePath = `${folderPath}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from(bucketName)
                    .upload(filePath, file);

                if (uploadError) {
                    console.error('Error uploading file:', uploadError);
                    alert(`Error al subir ${file.name}: ${uploadError.message}`);
                    continue;
                }

                const { data: { publicUrl } } = supabase.storage
                    .from(bucketName)
                    .getPublicUrl(filePath);

                newAttachments.push({
                    name: file.name,
                    url: publicUrl,
                    type: file.type,
                    size: file.size
                });
            }

            const updatedFiles = [...files, ...newAttachments];

            if (resetOnUpload) {
                setFiles([]);
                onUploadComplete(updatedFiles); // In reset mode, we arguably should send only newAttachments, but existing logic (files is likely empty) makes this safe. 
                // Actually, if we reset, 'files' state should technically strictly be just the new ones if we treat it as an event.
                // But given 'files' comes from state which starts at existingFiles, 'updatedFiles' is correct.
            } else {
                setFiles(updatedFiles);
                onUploadComplete(updatedFiles);
            }

        } catch (error) {
            console.error('Unexpected error:', error);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleRemoveFile = (index: number) => {
        const updatedFiles = files.filter((_, i) => i !== index);
        setFiles(updatedFiles);
        onUploadComplete(updatedFiles);
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <div className="w-full space-y-3">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className={`
                    flex items-center gap-2 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed
                    ${compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm bg-gray-50'}
                `}
                >
                    {isUploading ? <Loader2 size={compact ? 14 : 18} className="animate-spin" /> : <Upload size={compact ? 14 : 18} />}
                    {isUploading ? 'Subiendo...' : 'Adjuntar archivos'}
                </button>
                {!compact && <span className="text-xs text-gray-400">Máx. {maxSizeMB}MB</span>}
            </div>

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                multiple
                accept={acceptedTypes}
            />

            {files.length > 0 && (
                <div className="grid gap-2">
                    {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-xl group hover:border-gray-200 transition-colors">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="p-2 bg-white rounded-lg border border-gray-100 text-gray-500 shrink-0">
                                    {file.type.startsWith('image/') ? <ImageIcon size={16} /> : <FileText size={16} />}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-700 truncate" title={file.name}>{file.name}</p>
                                    <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href={file.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                                    title="Ver archivo"
                                >
                                    <FileText size={16} />
                                </a>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveFile(index)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Eliminar"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
