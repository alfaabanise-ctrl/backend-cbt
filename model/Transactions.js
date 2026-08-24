const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TransactionSchema = new Schema({
  user: {
    type: String,
  
  },
  transactionDate: {
    type: String,
   
  },
  

  amount: {
    type: Number,
    required: true
  },
  description: String,

  refid:{
    type: String,
    required: true
  },

 oldwallet: {
    type: String,
    
  },
 newwallet:{
    type: String,
  
  },
  status:{
    type: String,
  },

  recipient:{
    type: String,
    required: true
  },
  type:{
    type: String,
    required: true
  },

  value:{
    type: String,
    required: true
  },
});

module.exports = mongoose.model('Transaction', TransactionSchema);