import { cn } from "@/lib/utils";

interface Avatar {
  imageUrl: string;
  profileUrl: string;
}
interface AvatarCirclesProps {
  className?: string;
  avatarUrls: Avatar[];
  username?: string;
  onClick?: () => void;
}

export const AvatarCircles = ({
  className,
  avatarUrls,
  username,
  onClick,
}: AvatarCirclesProps) => {
  return (
    <div
      className={cn(
        "z-10 flex -space-x-4 rtl:space-x-reverse cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {avatarUrls.map((url, index) => (
        <a
          key={index}
          href={url.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            key={index}
            className="h-10 w-10 rounded-lg border-2 border-white dark:border-gray-800"
            src={url.imageUrl}
            width={40}
            height={40}
            alt={`Avatar ${index + 1}`}
          />
        </a>
      ))}
      {avatarUrls.length === 0 && username && (
        <div className="h-10 w-10 flex items-center justify-center rounded-lg border-2 border-white dark:border-gray-800 text-gray-50 dark:text-gray-950 font-bold bg-gray-700 dark:bg-gray-300">
          <span>{username[0].toUpperCase()}</span>
        </div>
      )}
    </div>
  );
};
