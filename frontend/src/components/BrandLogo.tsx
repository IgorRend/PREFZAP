interface BrandLogoProps {
    /** Square size in px for the brasão image. */
    size?: number;
    className?: string;
}

/**
 * Single source of truth for the Prefeitura de Mafra brand mark. Renders the
 * brasão (public/brasao.png). Swap the asset here to rebrand everywhere.
 */
export default function BrandLogo({ size = 32, className = '' }: BrandLogoProps) {
    return (
        <img
            src="/brasao.png"
            alt="Brasão de Mafra"
            width={size}
            height={size}
            className={className}
            style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
        />
    );
}
