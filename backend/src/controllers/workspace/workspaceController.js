/**
 * Workspace Controller
 * 
 * HTTP request handlers for workspace management operations:
 * - Workspace CRUD operations
 * - Member management and permissions
 * - Settings and preferences
 * - Categories and tags management
 * - Workspace analytics and reporting
 * 
 * @author Nirpeksh Scale Up App
 * @version 1.0.0
 */

const Workspace = require('../../models/workspace/Workspace');
const User = require('../../models/user/User');
const Task = require('../../models/task/Task');
const { catchAsync } = require('../../middleware/error');
const { NotFoundError, ValidationError, AuthorizationError, ConflictError } = require('../../middleware/error');
const { logBusiness, logger } = require('../../utils/logger/logger');

/**
 * @desc    Get all workspaces for current user
 * @route   GET /api/workspaces
 * @access  Private
 */
const getWorkspaces = catchAsync(async (req, res) => {
  const userId = req.user.id;

  const workspaces = await Workspace.findByUser(userId);

  // Add user role and permissions for each workspace
  const workspacesWithRoles = workspaces.map(workspace => {
    let userRole = 'viewer';
    let userPermissions = {};

    if (workspace.owner.toString() === userId) {
      userRole = 'owner';
      userPermissions = workspace.getPermissionsByRole('owner');
    } else {
      const member = workspace.members.find(m => 
        m.user.toString() === userId && m.status === 'active'
      );
      if (member) {
        userRole = member.role;
        userPermissions = member.permissions;
      }
    }

    return {
      ...workspace.toJSON(),
      userRole,
      userPermissions
    };
  });

  res.status(200).json({
    status: 'success',
    results: workspacesWithRoles.length,
    data: {
      workspaces: workspacesWithRoles
    }
  });
});

/**
 * @desc    Get single workspace by ID
 * @route   GET /api/workspaces/:id
 * @access  Private
 */
const getWorkspace = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const workspace = await Workspace.findById(id)
    .populate('owner', 'firstName lastName email avatar')
    .populate('members.user', 'firstName lastName email avatar')
    .populate('members.invitedBy', 'firstName lastName');

  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  // Check if user has access
  const hasAccess = workspace.owner.id === userId ||
                   workspace.members.some(member => 
                     member.user.id === userId && member.status === 'active'
                   );

  if (!hasAccess) {
    throw new AuthorizationError('You do not have access to this workspace');
  }

  // Get user role and permissions
  let userRole = 'viewer';
  let userPermissions = {};

  if (workspace.owner.id === userId) {
    userRole = 'owner';
    userPermissions = workspace.getPermissionsByRole('owner');
  } else {
    const member = workspace.members.find(m => 
      m.user.id === userId && m.status === 'active'
    );
    if (member) {
      userRole = member.role;
      userPermissions = member.permissions;
    }
  }

  // Get workspace statistics
  const taskStats = await Task.aggregate([
    { $match: { workspace: workspace._id, isArchived: false } },
    {
      $group: {
        _id: null,
        totalTasks: { $sum: 1 },
        completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        overdueTasks: { 
          $sum: { 
            $cond: [
              { 
                $and: [
                  { $lt: ['$dueDate', new Date()] },
                  { $nin: ['$status', ['done', 'cancelled']] }
                ]
              }, 
              1, 
              0
            ] 
          } 
        },
        keyTasks: { $sum: { $cond: ['$isKeyTask', 1, 0] } }
      }
    }
  ]);

  const stats = taskStats[0] || {
    totalTasks: 0,
    completedTasks: 0,
    overdueTasks: 0,
    keyTasks: 0
  };

  logBusiness('workspace_viewed', userId, workspace.id, {
    workspaceName: workspace.name,
    workspaceType: workspace.type,
    userRole
  });

  res.status(200).json({
    status: 'success',
    data: {
      workspace: {
        ...workspace.toJSON(),
        userRole,
        userPermissions,
        stats
      }
    }
  });
});

/**
 * @desc    Create new workspace
 * @route   POST /api/workspaces
 * @access  Private
 */
const createWorkspace = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { name, description, type, color, icon } = req.body;

  // Check if user already has a workspace of this type
  const existingWorkspace = await Workspace.findByUserAndType(userId, type);
  if (existingWorkspace) {
    throw new ConflictError(`You already have a ${type} workspace`);
  }

  // Create workspace data
  const workspaceData = {
    name,
    description,
    type,
    color: color || '#3B82F6',
    icon: icon || 'folder',
    owner: userId,
    members: [{
      user: userId,
      role: 'owner',
      permissions: {
        canCreateTasks: true,
        canEditTasks: true,
        canDeleteTasks: true,
        canManageMembers: true,
        canManageSettings: true,
        canViewReports: true,
        canExportData: true
      },
      status: 'active'
    }],
    settings: {
      isPrivate: type === 'personal',
      allowInvites: type !== 'personal',
      taskNumbering: {
        prefix: type === 'company' ? 'TASK' : 
                type === 'business' ? 'BIZ' : 'PER'
      }
    }
  };

  // Add default categories based on type
  if (type === 'personal') {
    workspaceData.categories = [
      { name: 'General', isDefault: true },
      { name: 'Health & Fitness', color: '#10B981' },
      { name: 'Learning', color: '#8B5CF6' },
      { name: 'Finance', color: '#F59E0B' },
      { name: 'Home', color: '#EF4444' }
    ];
  } else if (type === 'business') {
    workspaceData.categories = [
      { name: 'General', isDefault: true },
      { name: 'Marketing', color: '#EC4899' },
      { name: 'Development', color: '#3B82F6' },
      { name: 'Sales', color: '#10B981' },
      { name: 'Operations', color: '#F59E0B' }
    ];
  } else if (type === 'company') {
    workspaceData.categories = [
      { name: 'General', isDefault: true },
      { name: 'Projects', color: '#3B82F6' },
      { name: 'Meetings', color: '#8B5CF6' },
      { name: 'Reports', color: '#10B981' },
      { name: 'Administration', color: '#F59E0B' }
    ];
  }

  const workspace = new Workspace(workspaceData);
  await workspace.save();

  await workspace.populate('owner', 'firstName lastName email avatar');

  logBusiness('workspace_created', userId, workspace.id, {
    workspaceName: workspace.name,
    workspaceType: workspace.type
  });

  res.status(201).json({
    status: 'success',
    message: 'Workspace created successfully',
    data: {
      workspace: {
        ...workspace.toJSON(),
        userRole: 'owner',
        userPermissions: workspaceData.members[0].permissions
      }
    }
  });
});

/**
 * @desc    Update workspace settings
 * @route   PATCH /api/workspaces/:id
 * @access  Private
 */
const updateWorkspace = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const updates = req.body;

  const workspace = await Workspace.findById(id);
  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  // Check permissions
  if (!workspace.hasPermission(userId, 'canManageSettings')) {
    throw new AuthorizationError('You do not have permission to update workspace settings');
  }

  // Filter allowed updates
  const allowedUpdates = ['name', 'description', 'color', 'icon', 'settings'];
  const filteredUpdates = {};
  
  allowedUpdates.forEach(field => {
    if (updates[field] !== undefined) {
      filteredUpdates[field] = updates[field];
    }
  });

  // Apply updates
  Object.assign(workspace, filteredUpdates);
  await workspace.save();

  logBusiness('workspace_updated', userId, workspace.id, {
    updatedFields: Object.keys(filteredUpdates)
  });

  res.status(200).json({
    status: 'success',
    message: 'Workspace updated successfully',
    data: {
      workspace
    }
  });
});

/**
 * @desc    Delete workspace
 * @route   DELETE /api/workspaces/:id
 * @access  Private
 */
const deleteWorkspace = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const workspace = await Workspace.findById(id);
  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  // Only owner can delete workspace
  if (workspace.owner.toString() !== userId) {
    throw new AuthorizationError('Only workspace owner can delete the workspace');
  }

  // Archive the workspace instead of hard delete
  await workspace.archive(userId);

  logBusiness('workspace_deleted', userId, workspace.id, {
    workspaceName: workspace.name,
    workspaceType: workspace.type
  });

  res.status(200).json({
    status: 'success',
    message: 'Workspace deleted successfully'
  });
});

/**
 * @desc    Add member to workspace
 * @route   POST /api/workspaces/:id/members
 * @access  Private
 */
const addMember = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { email, role = 'member' } = req.body;
  const userId = req.user.id;

  const workspace = await Workspace.findById(id);
  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  // Check permissions
  if (!workspace.hasPermission(userId, 'canManageMembers')) {
    throw new AuthorizationError('You do not have permission to manage members');
  }

  // Find user by email
  const userToAdd = await User.findByEmail(email);
  if (!userToAdd) {
    throw new NotFoundError('User not found with provided email');
  }

  // Check if user is already a member
  const existingMember = workspace.members.find(member => 
    member.user.toString() === userToAdd.id
  );
  
  if (existingMember) {
    throw new ConflictError('User is already a member of this workspace');
  }

  // Add member
  await workspace.addMember(userToAdd.id, role, userId);

  await workspace.populate('members.user', 'firstName lastName email avatar');

  logBusiness('member_added', userId, workspace.id, {
    newMemberId: userToAdd.id,
    newMemberEmail: email,
    role
  });

  res.status(200).json({
    status: 'success',
    message: 'Member added successfully',
    data: {
      member: workspace.members[workspace.members.length - 1]
    }
  });
});

/**
 * @desc    Update member role
 * @route   PATCH /api/workspaces/:id/members/:memberId
 * @access  Private
 */
const updateMemberRole = catchAsync(async (req, res) => {
  const { id, memberId } = req.params;
  const { role } = req.body;
  const userId = req.user.id;

  const workspace = await Workspace.findById(id);
  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  // Check permissions
  if (!workspace.hasPermission(userId, 'canManageMembers')) {
    throw new AuthorizationError('You do not have permission to manage members');
  }

  // Cannot change owner role
  if (workspace.owner.toString() === memberId) {
    throw new ValidationError('Cannot change workspace owner role');
  }

  await workspace.updateMemberRole(memberId, role);

  logBusiness('member_role_updated', userId, workspace.id, {
    memberId,
    newRole: role
  });

  res.status(200).json({
    status: 'success',
    message: 'Member role updated successfully'
  });
});

/**
 * @desc    Remove member from workspace
 * @route   DELETE /api/workspaces/:id/members/:memberId
 * @access  Private
 */
const removeMember = catchAsync(async (req, res) => {
  const { id, memberId } = req.params;
  const userId = req.user.id;

  const workspace = await Workspace.findById(id);
  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  // Check permissions (users can remove themselves)
  if (userId !== memberId && !workspace.hasPermission(userId, 'canManageMembers')) {
    throw new AuthorizationError('You do not have permission to remove members');
  }

  // Cannot remove workspace owner
  if (workspace.owner.toString() === memberId) {
    throw new ValidationError('Cannot remove workspace owner');
  }

  await workspace.removeMember(memberId);

  logBusiness('member_removed', userId, workspace.id, {
    removedMemberId: memberId,
    removedBySelf: userId === memberId
  });

  res.status(200).json({
    status: 'success',
    message: 'Member removed successfully'
  });
});

/**
 * @desc    Add category to workspace
 * @route   POST /api/workspaces/:id/categories
 * @access  Private
 */
const addCategory = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { name, color, description } = req.body;
  const userId = req.user.id;

  const workspace = await Workspace.findById(id);
  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  // Check permissions
  if (!workspace.hasPermission(userId, 'canManageSettings')) {
    throw new AuthorizationError('You do not have permission to manage categories');
  }

  await workspace.addCategory(name, color, description);

  logBusiness('category_added', userId, workspace.id, {
    categoryName: name
  });

  res.status(201).json({
    status: 'success',
    message: 'Category added successfully',
    data: {
      categories: workspace.categories
    }
  });
});

/**
 * @desc    Add tag to workspace
 * @route   POST /api/workspaces/:id/tags
 * @access  Private
 */
const addTag = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { name, color } = req.body;
  const userId = req.user.id;

  const workspace = await Workspace.findById(id);
  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  // Check permissions
  if (!workspace.hasPermission(userId, 'canCreateTasks')) {
    throw new AuthorizationError('You do not have permission to add tags');
  }

  await workspace.addTag(name, color);

  logBusiness('tag_added', userId, workspace.id, {
    tagName: name
  });

  res.status(201).json({
    status: 'success',
    message: 'Tag added successfully',
    data: {
      tags: workspace.tags
    }
  });
});

/**
 * @desc    Get workspace analytics
 * @route   GET /api/workspaces/:id/analytics
 * @access  Private
 */
const getWorkspaceAnalytics = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { timeRange = '30' } = req.query; // days

  const workspace = await Workspace.findById(id);
  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  // Check permissions
  if (!workspace.hasPermission(userId, 'canViewReports')) {
    throw new AuthorizationError('You do not have permission to view analytics');
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(timeRange));

  // Task completion trends
  const completionTrends = await Task.aggregate([
    {
      $match: {
        workspace: workspace._id,
        completedAt: { $gte: startDate, $lte: new Date() },
        isArchived: false
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  // Member productivity
  const memberProductivity = await Task.aggregate([
    {
      $match: {
        workspace: workspace._id,
        isArchived: false,
        assignedTo: { $ne: null }
      }
    },
    {
      $group: {
        _id: '$assignedTo',
        totalTasks: { $sum: 1 },
        completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        overdueTasks: { 
          $sum: { 
            $cond: [
              { 
                $and: [
                  { $lt: ['$dueDate', new Date()] },
                  { $nin: ['$status', ['done', 'cancelled']] }
                ]
              }, 
              1, 
              0
            ] 
          } 
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
        pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1, avatar: 1 } }]
      }
    },
    { $unwind: '$user' }
  ]);

  // Category usage
  const categoryUsage = await Task.aggregate([
    {
      $match: {
        workspace: workspace._id,
        isArchived: false,
        category: { $ne: null }
      }
    },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      analytics: {
        completionTrends,
        memberProductivity,
        categoryUsage,
        timeRange: `${timeRange} days`,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          type: workspace.type
        }
      }
    }
  });
});

/**
 * @desc    Export workspace data
 * @route   GET /api/workspaces/:id/export
 * @access  Private
 */
const exportWorkspaceData = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { format = 'json' } = req.query;

  const workspace = await Workspace.findById(id);
  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  // Check permissions
  if (!workspace.hasPermission(userId, 'canExportData')) {
    throw new AuthorizationError('You do not have permission to export data');
  }

  // Get all tasks in workspace
  const tasks = await Task.find({ workspace: id, isArchived: false })
    .populate('createdBy assignedTo', 'firstName lastName email')
    .lean();

  const exportData = {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      type: workspace.type,
      description: workspace.description,
      categories: workspace.categories,
      tags: workspace.tags,
      exportedAt: new Date(),
      exportedBy: userId
    },
    tasks: tasks.map(task => ({
      id: task._id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      isKeyTask: task.isKeyTask,
      dueDate: task.dueDate,
      createdBy: task.createdBy?.email,
      assignedTo: task.assignedTo?.email,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      category: task.category,
      tags: task.tags,
      subtasks: task.subtasks,
      comments: task.comments.length,
      attachments: task.attachments.length
    }))
  };

  logBusiness('workspace_data_exported', userId, workspace.id, {
    format,
    taskCount: tasks.length
  });

  if (format === 'csv') {
    // TODO: Implement CSV export
    res.status(501).json({
      status: 'error',
      message: 'CSV export will be implemented in future version'
    });
  } else {
    res.status(200).json({
      status: 'success',
      data: exportData
    });
  }
});

module.exports = {
  getWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  addMember,
  updateMemberRole,
  removeMember,
  addCategory,
  addTag,
  getWorkspaceAnalytics,
  exportWorkspaceData
};