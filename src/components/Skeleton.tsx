import React from 'react';

interface SkeletonProps {
    className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = "" }) => {
    return (
        <div className={`animate-pulse bg-gray-200 dark:bg-gray-800 rounded-md ${className}`} />
    );
};

export const TaskSkeleton: React.FC = () => {
    return (
        <div className="flex items-center gap-4 p-3 rounded-xl border border-gray-100 dark:border-border bg-white dark:bg-card">
            <Skeleton className="w-6 h-6 rounded-full" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="w-16 h-6 rounded-lg" />
        </div>
    );
};
