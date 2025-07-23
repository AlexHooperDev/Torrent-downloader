import { useState, useEffect } from "react";
import { myListService, MyListItem } from "./myListService";
import { CatalogItem } from "./api";
import Modal from "./Modal";
import ShowModal from "./ShowModal";
import "./MyListPage.css";

export default function MyListPage() {
  const [myListItems, setMyListItems] = useState<MyListItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);

  // Load My List items
  useEffect(() => {
    setMyListItems(myListService.getMyList());
  }, []);

  // Listen for My List updates
  useEffect(() => {
    const handleMyListUpdate = () => {
      setMyListItems(myListService.getMyList());
    };

    window.addEventListener('myListUpdated', handleMyListUpdate);
    return () => window.removeEventListener('myListUpdated', handleMyListUpdate);
  }, []);

  const handleItemSelect = (item: CatalogItem) => {
    setSelectedItem(item);
  };

  const handleCloseModal = () => {
    setSelectedItem(null);
  };

  return (
    <div className="my-list-page">
      <div className="my-list-container">
        <div className="my-list-header">
          <h2 className="my-list-title">My List</h2>
          {myListItems.length > 0 && (
            <p className="my-list-subtitle">
              {myListItems.length} title{myListItems.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {myListItems.length === 0 ? (
          <div className="my-list-empty">
            <div className="empty-state">
              <div className="empty-icon">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="#b3b3b3">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </div>
              <h2 className="empty-title">You haven't added any titles to your list yet.</h2>
              <p className="empty-subtitle">
                Explore and add movies and TV shows to your list by clicking the plus icon.
              </p>
            </div>
          </div>
        ) : (
          <div className="my-list-grid">
            {myListItems.map((item) => (
              <div key={item.id} className="my-list-item">
                <div 
                  className="my-list-poster"
                  onClick={() => handleItemSelect(item)}
                >
                  <img
                    src={`https://image.tmdb.org/t/p/w500${item.poster_path}`}
                    alt={item.title}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgdmlld0JveD0iMCAwIDMwMCA0NTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iNDUwIiBmaWxsPSIjNDA0MDQwIi8+CjxwYXRoIGQ9Ik0xNTAgMjI1TDEyMCAyMDBIMTgwTDE1MCAyMjVaIiBmaWxsPSIjNjY2NjY2Ii8+Cjx0ZXh0IHg9IjE1MCIgeT0iMjc1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNjY2NjY2IiBmb250LXNpemU9IjE0Ij5ObyBJbWFnZTwvdGV4dD4KPC9zdmc+';
                    }}
                  />
                  
                  <div className="my-list-overlay">
                    <button 
                      className="my-list-play-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemSelect(item);
                      }}
                    >
                      <span className="play-icon">▶</span>
                    </button>
                    
                    <button
                      className="my-list-remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        myListService.removeFromMyList(item.id);
                      }}
                      aria-label="Remove from My List"
                      title="Remove from My List"
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="my-list-info">
                  <h3 className="my-list-item-title">{item.title}</h3>
                  <div className="my-list-meta">
                    <span className="my-list-type">
                      {item.media_type === "tv" ? "TV Series" : "Movie"}
                    </span>
                    {item.year && (
                      <span className="my-list-year">{item.year}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for selected item */}
      {selectedItem && (
        selectedItem.media_type === "tv" ? (
          <ShowModal 
            item={selectedItem} 
            onClose={handleCloseModal} 
          />
        ) : (
          <Modal 
            item={selectedItem} 
            onClose={handleCloseModal} 
          />
        )
      )}
    </div>
  );
} 