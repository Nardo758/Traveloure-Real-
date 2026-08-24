import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Trash2, 
  Sparkles, 
  ArrowRight,
  ShoppingBag,
  Minus,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

export interface CartItem {
  id: string;
  title: string;
  image: string;
  price: number;
  currency: string;
  date?: string;
  time?: string;
  quantity: number;
}

interface CartPanelProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onRemoveItem?: (id: string) => void;
  onUpdateQuantity?: (id: string, quantity: number) => void;
  onOptimizeWithAI?: () => void;
  onCheckout?: () => void;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
};

const itemVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 }
};

export function CartPanel({
  isOpen,
  onClose,
  items,
  onRemoveItem,
  onUpdateQuantity,
  onOptimizeWithAI,
  onCheckout
}: CartPanelProps) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.3 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.5 }}
            transition={{ 
              type: 'spring', 
              damping: 30, 
              stiffness: 300 
            }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-ocean-100 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-ocean-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Your Itinerary</h2>
                  <p className="text-sm text-gray-500">{itemCount} {itemCount === 1 ? 'item' : 'items'}</p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </motion.button>
            </div>

            {/* Cart Items */}
            {items.length > 0 ? (
              <>
                <ScrollArea className="flex-1 px-5">
                  <div className="py-4 space-y-4">
                    <AnimatePresence mode="popLayout">
                      {items.map((item) => (
                        <motion.div
                          key={item.id}
                          variants={itemVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          layout
                          className="flex gap-4 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group"
                        >
                          {/* Thumbnail */}
                          <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                            <img
                              src={item.image}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 truncate">{item.title}</h4>
                            {item.date && (
                              <p className="text-sm text-gray-500">{item.date}</p>
                            )}
                            {item.time && (
                              <p className="text-sm text-gray-500">{item.time}</p>
                            )}
                            <p className="text-sm font-semibold text-ocean-600 mt-1">
                              {item.currency}{item.price}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-col items-end justify-between">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => onRemoveItem?.(item.id)}
                              className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </motion.button>

                            {/* Quantity Controls */}
                            <div className="flex items-center gap-2">
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => onUpdateQuantity?.(item.id, Math.max(0, item.quantity - 1))}
                                className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
                              >
                                <Minus className="w-3 h-3" />
                              </motion.button>
                              <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => onUpdateQuantity?.(item.id, item.quantity + 1)}
                                className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                              </motion.button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </ScrollArea>

                {/* Footer */}
                <div className="border-t border-gray-100 p-5 space-y-4 bg-white">
                  {/* AI Optimize Button */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onOptimizeWithAI}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-violet-500/25 transition-shadow"
                  >
                    <Sparkles className="w-5 h-5" />
                    Optimize with AI
                  </motion.button>

                  <Separator />

                  {/* Subtotal */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="text-xl font-bold text-gray-900">${subtotal.toFixed(2)}</span>
                  </div>

                  {/* Checkout Button */}
                  <Button
                    onClick={onCheckout}
                    className="w-full h-14 gradient-ocean text-white font-semibold rounded-xl hover:shadow-glow transition-all duration-300 group text-lg"
                  >
                    Proceed to Checkout
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>

                  <p className="text-center text-xs text-gray-400">
                    Taxes and fees calculated at checkout
                  </p>
                </div>
              </>
            ) : (
              /* Empty State */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-6"
                >
                  <ShoppingBag className="w-12 h-12 text-gray-400" />
                </motion.div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Your itinerary is empty
                </h3>
                <p className="text-gray-500 mb-6 max-w-xs">
                  Start exploring amazing destinations and add them to your trip!
                </p>
                <Button
                  onClick={onClose}
                  className="btn-primary"
                >
                  Explore Destinations
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default CartPanel;
