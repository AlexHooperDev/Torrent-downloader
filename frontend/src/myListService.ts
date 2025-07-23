import { CatalogItem } from './api';

export interface MyListItem extends CatalogItem {
  addedAt: number; // timestamp when added
}

const MY_LIST_KEY = 'hoopflix-my-list';

export const myListService = {
  // Get all items in My List
  getMyList(): MyListItem[] {
    try {
      const stored = localStorage.getItem(MY_LIST_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error reading My List from localStorage:', error);
      return [];
    }
  },

  // Add item to My List
  addToMyList(item: CatalogItem): void {
    try {
      const currentList = this.getMyList();
      
      // Check if item already exists
      if (currentList.some(listItem => listItem.id === item.id)) {
        return; // Already in list
      }

      const myListItem: MyListItem = {
        ...item,
        addedAt: Date.now()
      };

      const updatedList = [myListItem, ...currentList]; // Add to beginning
      localStorage.setItem(MY_LIST_KEY, JSON.stringify(updatedList));
      
      // Dispatch custom event for components to listen to
      window.dispatchEvent(new CustomEvent('myListUpdated', { 
        detail: { action: 'add', item: myListItem } 
      }));
    } catch (error) {
      console.error('Error adding to My List:', error);
    }
  },

  // Remove item from My List
  removeFromMyList(itemId: number): void {
    try {
      const currentList = this.getMyList();
      const updatedList = currentList.filter(item => item.id !== itemId);
      localStorage.setItem(MY_LIST_KEY, JSON.stringify(updatedList));
      
      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('myListUpdated', { 
        detail: { action: 'remove', itemId } 
      }));
    } catch (error) {
      console.error('Error removing from My List:', error);
    }
  },

  // Check if item is in My List
  isInMyList(itemId: number): boolean {
    try {
      const currentList = this.getMyList();
      return currentList.some(item => item.id === itemId);
    } catch (error) {
      console.error('Error checking My List:', error);
      return false;
    }
  },

  // Toggle item in My List (add if not present, remove if present)
  toggleInMyList(item: CatalogItem): boolean {
    const isCurrentlyInList = this.isInMyList(item.id);
    
    if (isCurrentlyInList) {
      this.removeFromMyList(item.id);
      return false; // Now removed
    } else {
      this.addToMyList(item);
      return true; // Now added
    }
  }
}; 