interface BubbleSkeletonProps {
    outgoing?: boolean;
    width?: string;
    hasAvatar?: boolean;
}

function BubbleSkeleton({ outgoing = false, width = '55%', hasAvatar = true }: BubbleSkeletonProps) {
    return (
        <div className="chat-skeleton-row" style={{ flexDirection: outgoing ? 'row-reverse' : 'row' }}>
            {!outgoing && hasAvatar && <div className="chat-skeleton-avatar skeleton" />}
            <div className="chat-skeleton-bubble" style={{ width }}>
                <div className="skeleton chat-skeleton-main" />
                <div className="skeleton chat-skeleton-time" style={{ alignSelf: outgoing ? 'flex-end' : 'flex-start' }} />
            </div>
        </div>
    );
}

export function ChatSkeleton() {
    return (
        <div className="chat-skeleton-container">
            <BubbleSkeleton outgoing={false} width="58%" />
            <BubbleSkeleton outgoing={true} width="42%" />
            <BubbleSkeleton outgoing={false} width="70%" />
            <BubbleSkeleton outgoing={true} width="35%" />
            <BubbleSkeleton outgoing={false} width="52%" hasAvatar={false} />
            <BubbleSkeleton outgoing={true} width="60%" />
        </div>
    );
}
