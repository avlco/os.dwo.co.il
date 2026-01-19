# Design Document: Critical Fixes for Client & Case Management

**Date:** 2026-01-19
**Status:** Draft - Awaiting Approval
**Priority:** HIGH - Blocks user ability to add clients and cases

---

## 🎯 Problem Statement

Users report they cannot add new clients or cases. Investigation reveals:

1. **No error notifications** - When create/update fails, users see nothing
2. **No success feedback** - Even successful operations lack visual confirmation
3. **Missing validation** - Invalid data passes through without checks
4. **Soft delete not implemented** - Deleting clients with cases causes orphaned data

**Impact:** Users cannot effectively manage clients/cases, making the system unusable for core functionality.

---

## 🔍 Root Cause Analysis

### Issue 1: Silent Failures
```javascript
// Current code in Clients.jsx:109-116
const createMutation = useMutation({
  mutationFn: (data) => base44.entities.Client.create(data),
  onSuccess: () => {
    queryClient.invalidateQueries(['clients']);
    setIsDialogOpen(false);
    resetForm();
  },
  // ❌ Missing onError handler!
  // ❌ No toast notification!
});
```

**Why this breaks:** When API call fails (network error, validation error, permission denied), the mutation fails silently. Dialog stays open, no error message shown.

### Issue 2: Missing Validation

**Current state:**
- Only `name` is marked as required in HTML
- No email format validation
- No uniqueness checks on `client_number` or `case_number`
- Date fields can be illogical (renewal before filing)

### Issue 3: Hard Delete

**Current code in Clients.jsx:127-132:**
```javascript
const deleteMutation = useMutation({
  mutationFn: (id) => base44.entities.Client.delete(id),
  onSuccess: () => {
    queryClient.invalidateQueries(['clients']);
  },
});
```

**Problem:** Deletes client from database completely, leaving orphaned cases.

---

## 💡 Solution Design

### Phase 1: Toast Notifications (Priority: CRITICAL)

**Existing Infrastructure:**
- ✅ Toast system already exists: `src/components/ui/use-toast.jsx`
- ✅ Used successfully in MailRoom.jsx and other pages
- ✅ Supports variants: default, destructive

**Implementation Pattern:**
```javascript
import { useToast } from "@/components/ui/use-toast";

const { toast } = useToast();

const createMutation = useMutation({
  mutationFn: (data) => base44.entities.Client.create(data),
  onSuccess: () => {
    queryClient.invalidateQueries(['clients']);
    setIsDialogOpen(false);
    resetForm();
    toast({
      title: "הלקוח נוסף בהצלחה",
      description: `הלקוח "${formData.name}" נוצר במערכת`,
    });
  },
  onError: (error) => {
    console.error('Failed to create client:', error);
    toast({
      variant: "destructive",
      title: "שגיאה ביצירת לקוח",
      description: error.message || "אנא נסה שנית או פנה לתמיכה",
    });
  },
});
```

**Files to modify:**
- `src/pages/Clients.jsx` (lines 109-132)
- `src/pages/Cases.jsx` (lines 124-147)

**Actions per mutation:**
| Mutation | Success Message | Error Message |
|----------|----------------|---------------|
| Create Client | "הלקוח נוסף בהצלחה" | "שגיאה ביצירת לקוח" |
| Update Client | "הלקוח עודכן בהצלחה" | "שגיאה בעדכון לקוח" |
| Delete Client | "הלקוח סומן כלא פעיל" | "שגיאה במחיקת לקוח" |
| Create Case | "התיק נוסף בהצלחה" | "שגיאה ביצירת תיק" |
| Update Case | "התיק עודכן בהצלחה" | "שגיאה בעדכון תיק" |
| Delete Case | "התיק נמחק בהצלחה" | "שגיאה במחיקת תיק" |

---

### Phase 2: Client-Side Validation (Priority: HIGH)

**Validation Rules:**

#### Clients (Clients.jsx)
```javascript
const validateClientForm = (data) => {
  const errors = [];

  // Required fields
  if (!data.name || data.name.trim() === '') {
    errors.push('שם הלקוח הוא שדה חובה');
  }

  // Email validation (if provided)
  if (data.email && data.email.trim() !== '') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      errors.push('כתובת האימייל אינה תקינה');
    }
  }

  // Phone validation (basic - if provided)
  if (data.phone && data.phone.trim() !== '') {
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (!phoneRegex.test(data.phone)) {
      errors.push('מספר הטלפון אינו תקין');
    }
  }

  // Hourly rate must be positive
  if (data.hourly_rate && parseFloat(data.hourly_rate) < 0) {
    errors.push('תעריף שעתי חייב להיות מספר חיובי');
  }

  return errors;
};
```

#### Cases (Cases.jsx)
```javascript
const validateCaseForm = (data) => {
  const errors = [];

  // Required fields
  if (!data.case_number || data.case_number.trim() === '') {
    errors.push('מספר תיק הוא שדה חובה');
  }

  if (!data.title || data.title.trim() === '') {
    errors.push('שם הנכס הוא שדה חובה');
  }

  // Date logic validation
  if (data.filing_date && data.renewal_date) {
    const filing = new Date(data.filing_date);
    const renewal = new Date(data.renewal_date);

    if (renewal <= filing) {
      errors.push('תאריך חידוש חייב להיות אחרי תאריך ההגשה');
    }
  }

  if (data.filing_date && data.expiry_date) {
    const filing = new Date(data.filing_date);
    const expiry = new Date(data.expiry_date);

    if (expiry <= filing) {
      errors.push('תאריך פקיעה חייב להיות אחרי תאריך ההגשה');
    }
  }

  // Hourly rate validation
  if (data.hourly_rate && parseFloat(data.hourly_rate) < 0) {
    errors.push('תעריף שעתי חייב להיות מספר חיובי');
  }

  return errors;
};
```

**Usage in handleSubmit:**
```javascript
const handleSubmit = (e) => {
  e.preventDefault();

  // Validate form
  const validationErrors = validateClientForm(formData);

  if (validationErrors.length > 0) {
    toast({
      variant: "destructive",
      title: "שגיאת ולידציה",
      description: validationErrors.join(', '),
    });
    return;
  }

  // Check uniqueness (if creating new)
  if (!editingClient && formData.client_number) {
    const duplicate = clients.find(c => c.client_number === formData.client_number);
    if (duplicate) {
      toast({
        variant: "destructive",
        title: "מספר לקוח כבר קיים",
        description: `הלקוח "${duplicate.name}" כבר משתמש במספר זה`,
      });
      return;
    }
  }

  // Proceed with mutation
  if (editingClient) {
    updateMutation.mutate({ id: editingClient.id, data: formData });
  } else {
    createMutation.mutate(formData);
  }
};
```

---

### Phase 3: Soft Delete Implementation (Priority: HIGH)

**Approach:** Mark records as inactive instead of deleting.

**Why Soft Delete?**
- ✅ Preserves data integrity (cases remain linked to clients)
- ✅ Enables data recovery
- ✅ Maintains audit trail
- ✅ Prevents accidental data loss

**Implementation:**

#### 1. Modify Delete Mutation
```javascript
// Change from hard delete to soft delete
const deleteMutation = useMutation({
  mutationFn: async (id) => {
    // Check if client has active cases
    const clientCases = cases.filter(c => c.client_id === id);

    if (clientCases.length > 0) {
      // Show warning with case count
      const confirmed = window.confirm(
        `ללקוח זה יש ${clientCases.length} תיקים פעילים. ` +
        `סימון הלקוח כלא פעיל יסתיר אותו מהרשימות אך ישמור את התיקים. האם להמשיך?`
      );

      if (!confirmed) {
        throw new Error('הפעולה בוטלה על ידי המשתמש');
      }
    }

    // Soft delete: set is_active to false
    return base44.entities.Client.update(id, { is_active: false });
  },
  onSuccess: () => {
    queryClient.invalidateQueries(['clients']);
    toast({
      title: "הלקוח סומן כלא פעיל",
      description: "הלקוח הוסתר מהרשימות אך הנתונים נשמרו",
    });
  },
  onError: (error) => {
    // Don't show error if user cancelled
    if (error.message !== 'הפעולה בוטלה על ידי המשתמש') {
      toast({
        variant: "destructive",
        title: "שגיאה בעדכון סטטוס",
        description: error.message,
      });
    }
  },
});
```

#### 2. Filter Inactive Clients in List
```javascript
// In Clients.jsx - modify the query to filter out inactive clients by default
const { data: allClients = [], isLoading } = useQuery({
  queryKey: ['clients'],
  queryFn: () => base44.entities.Client.list('-created_date', 500),
});

// Filter to show only active clients by default
const clients = allClients.filter(c => c.is_active !== false);

// Optional: Add toggle to show inactive
const [showInactive, setShowInactive] = useState(false);
const displayClients = showInactive ? allClients : clients;
```

#### 3. Add Restore Functionality (Optional Enhancement)
```javascript
const restoreMutation = useMutation({
  mutationFn: (id) => base44.entities.Client.update(id, { is_active: true }),
  onSuccess: () => {
    queryClient.invalidateQueries(['clients']);
    toast({
      title: "הלקוח שוחזר",
      description: "הלקוח פעיל שוב במערכת",
    });
  },
});
```

---

## 📊 Summary of Changes

### Files to Modify

| File | Lines | Changes |
|------|-------|---------|
| `src/pages/Clients.jsx` | 109-132 | Add toast, onError handlers |
| `src/pages/Clients.jsx` | 182-189 | Add validation logic |
| `src/pages/Clients.jsx` | 127-132 | Implement soft delete |
| `src/pages/Cases.jsx` | 124-147 | Add toast, onError handlers |
| `src/pages/Cases.jsx` | 197-210 | Add validation logic |

### New Functions to Add

1. **Clients.jsx:**
   - `validateClientForm(data)` - Client-side validation
   - Modified `handleSubmit()` - Add validation calls
   - Modified `deleteMutation` - Soft delete logic

2. **Cases.jsx:**
   - `validateCaseForm(data)` - Client-side validation
   - Modified `handleSubmit()` - Add validation calls
   - Modified date field handling in submit

---

## 🧪 Testing Strategy

### Manual Test Cases

#### Test 1: Error Notifications
- **Given:** Invalid email entered
- **When:** User clicks "צור"
- **Then:** Toast appears with "שגיאת ולידציה: כתובת האימייל אינה תקינה"

#### Test 2: Success Notifications
- **Given:** Valid client data entered
- **When:** User clicks "צור"
- **Then:** Toast appears with "הלקוח נוסף בהצלחה"

#### Test 3: Uniqueness Check
- **Given:** Client number "CL-001" already exists
- **When:** User tries to create new client with same number
- **Then:** Toast appears with "מספר לקוח כבר קיים"

#### Test 4: Soft Delete
- **Given:** Client has 5 active cases
- **When:** User clicks delete
- **Then:** Confirmation dialog shows "ללקוח זה יש 5 תיקים פעילים..."
- **When:** User confirms
- **Then:** Client marked as inactive, still visible in case relationships

#### Test 5: Date Validation
- **Given:** Filing date: 2024-06-01, Renewal date: 2024-01-01
- **When:** User submits case form
- **Then:** Toast appears with "תאריך חידוש חייב להיות אחרי תאריך ההגשה"

---

## 🚀 Implementation Plan

### Task Breakdown (2-5 minutes each)

#### Clients.jsx

1. **Task 1.1:** Import useToast hook (1 min)
2. **Task 1.2:** Add toast to createMutation.onSuccess (2 min)
3. **Task 1.3:** Add onError handler to createMutation (2 min)
4. **Task 1.4:** Add toast to updateMutation.onSuccess (2 min)
5. **Task 1.5:** Add onError handler to updateMutation (2 min)
6. **Task 1.6:** Add validateClientForm function (5 min)
7. **Task 1.7:** Add validation call in handleSubmit (3 min)
8. **Task 1.8:** Add uniqueness check in handleSubmit (3 min)
9. **Task 1.9:** Modify deleteMutation for soft delete (5 min)
10. **Task 1.10:** Add client filtering for is_active (2 min)

#### Cases.jsx

11. **Task 2.1:** Import useToast hook (1 min)
12. **Task 2.2:** Add toast to createMutation.onSuccess (2 min)
13. **Task 2.3:** Add onError handler to createMutation (2 min)
14. **Task 2.4:** Add toast to updateMutation.onSuccess (2 min)
15. **Task 2.5:** Add onError handler to updateMutation (2 min)
16. **Task 2.6:** Add validateCaseForm function (5 min)
17. **Task 2.7:** Add validation call in handleSubmit (3 min)
18. **Task 2.8:** Add uniqueness check in handleSubmit (3 min)
19. **Task 2.9:** Add onError to deleteMutation (2 min)
20. **Task 2.10:** Fix date field null handling (2 min)

**Total estimated time:** ~50 minutes

---

## 🔄 Alternatives Considered

### Alternative 1: Server-Side Validation Only
- **Pros:** Centralized validation logic, can't be bypassed
- **Cons:** Slower feedback, requires backend changes, not in scope
- **Decision:** Start with client-side, add server-side later

### Alternative 2: Use React Hook Form + Zod
- **Pros:** Industry standard, powerful, type-safe
- **Cons:** New dependency, learning curve, overkill for simple validation
- **Decision:** Keep validation simple and inline for now

### Alternative 3: Cascading Delete
- **Pros:** Cleaner database, no orphaned records
- **Cons:** Dangerous, permanent data loss, user may not expect it
- **Decision:** Soft delete is safer

### Alternative 4: Remove Calendar Feature
- **Pros:** Removes incomplete feature
- **Cons:** Out of scope for current fix
- **Decision:** Deferred to separate task

---

## ✅ Acceptance Criteria

### Must Have (Critical)
- [ ] All mutations have onError handlers
- [ ] All mutations show success toast
- [ ] All mutations show error toast
- [ ] Email validation works
- [ ] Date logic validation works
- [ ] Uniqueness checks work for client_number and case_number
- [ ] Soft delete prevents hard deletion of clients with cases
- [ ] Inactive clients are hidden from lists

### Nice to Have (Optional)
- [ ] Phone number validation
- [ ] Restore inactive clients feature
- [ ] Toggle to show/hide inactive records
- [ ] More detailed validation messages

---

## 📈 Success Metrics

**Before Fix:**
- Users cannot see why client/case creation fails
- Support tickets: ~10/week about "cannot add client"
- User confusion: HIGH

**After Fix:**
- Clear error messages for all failure scenarios
- Success confirmation for all operations
- Support tickets: Expected < 2/week
- User confidence: HIGH

---

## 🔐 Security Considerations

- Client-side validation is for UX only - assume server validates too
- Soft delete doesn't change permissions (users who could delete can still "soft delete")
- Email regex is basic - not cryptographically secure
- Uniqueness check is client-side only (race condition possible)

---

## 📚 References

- Toast System: `/src/components/ui/use-toast.jsx`
- Example Usage: `/src/pages/MailRoom.jsx:56-60, 84-87`
- Client Management: `/src/pages/Clients.jsx`
- Case Management: `/src/pages/Cases.jsx`

---

## 🎯 Next Steps After Approval

1. **Create git worktree** on branch `claude/review-system-code-FddJT`
2. **Break down into 2-5 min tasks** (already done above)
3. **Implement with TDD approach** (write test, see it fail, write code, see it pass)
4. **Review after each major section** (Clients.jsx done → review, Cases.jsx done → review)
5. **Final verification** - Run through all test cases
6. **Commit and push** to branch

---

**Status:** 🟡 DRAFT - Awaiting User Approval

**Approval Questions:**
1. Does this design solve the reported problem?
2. Are the validation rules appropriate for your use case?
3. Is soft delete the right approach for your workflow?
4. Any concerns or modifications needed?
